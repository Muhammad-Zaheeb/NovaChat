"""Friend requests. Raises FriendError (no HTTP types).

Rules: one row per unordered pair. A declined request may be re-sent right away
(the row is reused). Unfriending / cancelling deletes the row."""
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.friendship import Friendship, FriendshipStatus
from app.models.user import User


class FriendError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def _pair(a: int, b: int):
    return or_(
        (Friendship.requester_id == a) & (Friendship.addressee_id == b),
        (Friendship.requester_id == b) & (Friendship.addressee_id == a),
    )


async def get_between(db: AsyncSession, a: int, b: int) -> Friendship | None:
    return await db.scalar(select(Friendship).where(_pair(a, b)))


async def are_friends(db: AsyncSession, a: int, b: int) -> bool:
    f = await get_between(db, a, b)
    return f is not None and f.status == FriendshipStatus.accepted


async def non_friends(db: AsyncSession, me_id: int, ids: set[int]) -> set[int]:
    """Subset of `ids` that are not accepted friends of me_id."""
    if not ids:
        return set()
    rows = await db.scalars(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                (Friendship.requester_id == me_id) & Friendship.addressee_id.in_(ids),
                (Friendship.addressee_id == me_id) & Friendship.requester_id.in_(ids),
            ),
        )
    )
    friends = {f.addressee_id if f.requester_id == me_id else f.requester_id for f in rows}
    return ids - friends


async def mutual_counts(db: AsyncSession, me_id: int, ids: list[int]) -> dict[int, int]:
    """Number of accepted friends each of `ids` shares with me_id."""
    if not ids:
        return {}
    rows = await db.execute(
        select(Friendship.requester_id, Friendship.addressee_id).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(Friendship.requester_id == me_id, Friendship.addressee_id == me_id),
        )
    )
    mine = {b if a == me_id else a for a, b in rows}
    if not mine:
        return {}
    rows = await db.execute(
        select(Friendship.requester_id, Friendship.addressee_id).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(Friendship.requester_id.in_(ids), Friendship.addressee_id.in_(ids)),
        )
    )
    out: dict[int, int] = {}
    for a, b in rows:
        for x, y in ((a, b), (b, a)):
            if x in ids and y in mine:
                out[x] = out.get(x, 0) + 1
    return out


async def statuses(db: AsyncSession, me_id: int, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = await db.scalars(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == me_id) & Friendship.addressee_id.in_(ids),
                (Friendship.addressee_id == me_id) & Friendship.requester_id.in_(ids),
            )
        )
    )
    out: dict[int, str] = {}
    for f in rows:
        other = f.addressee_id if f.requester_id == me_id else f.requester_id
        if f.status == FriendshipStatus.accepted:
            out[other] = "friends"
        elif f.status == FriendshipStatus.pending:
            out[other] = "pending_outgoing" if f.requester_id == me_id else "pending_incoming"
    return out


async def send_request(db: AsyncSession, me: User, user_id: int) -> tuple[Friendship, bool]:
    """Returns (friendship, auto_accepted)."""
    if user_id == me.id:
        raise FriendError(400, "You cannot add yourself")
    if await db.get(User, user_id) is None:
        raise FriendError(404, "User not found")
    f = await get_between(db, me.id, user_id)
    now = datetime.now(timezone.utc)
    if f is None:
        f = Friendship(requester_id=me.id, addressee_id=user_id)
        db.add(f)
        auto = False
    elif f.status == FriendshipStatus.accepted:
        raise FriendError(409, "Already friends")
    elif f.status == FriendshipStatus.pending:
        if f.requester_id == me.id:
            raise FriendError(409, "Request already sent")
        f.status, f.responded_at, auto = FriendshipStatus.accepted, now, True  # they asked first
    else:  # declined earlier: allow asking again, whoever declined
        f.requester_id, f.addressee_id = me.id, user_id
        f.status, f.created_at, f.responded_at, auto = FriendshipStatus.pending, now, None, False
    await db.commit()
    await db.refresh(f)
    return f, auto


async def _incoming(db: AsyncSession, me: User, req_id: int) -> Friendship:
    f = await db.get(Friendship, req_id)
    if f is None or f.addressee_id != me.id or f.status != FriendshipStatus.pending:
        raise FriendError(404, "Request not found")
    return f


async def accept(db: AsyncSession, me: User, req_id: int) -> Friendship:
    f = await _incoming(db, me, req_id)
    f.status, f.responded_at = FriendshipStatus.accepted, datetime.now(timezone.utc)
    await db.commit()
    return f


async def decline(db: AsyncSession, me: User, req_id: int) -> Friendship:
    f = await _incoming(db, me, req_id)
    f.status, f.responded_at = FriendshipStatus.declined, datetime.now(timezone.utc)
    await db.commit()
    return f


async def cancel(db: AsyncSession, me: User, req_id: int) -> Friendship:
    f = await db.get(Friendship, req_id)
    if f is None or f.requester_id != me.id or f.status != FriendshipStatus.pending:
        raise FriendError(404, "Request not found")
    await db.delete(f)
    await db.commit()
    return f


async def pending(db: AsyncSession, me: User) -> tuple[list[Friendship], list[Friendship]]:
    rows = list(
        await db.scalars(
            select(Friendship)
            .where(
                Friendship.status == FriendshipStatus.pending,
                or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
            )
            .order_by(Friendship.created_at.desc())
        )
    )
    return (
        [f for f in rows if f.addressee_id == me.id],
        [f for f in rows if f.requester_id == me.id],
    )


async def friends_of(db: AsyncSession, me: User) -> list[User]:
    rows = await db.scalars(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
        )
    )
    users = [f.addressee if f.requester_id == me.id else f.requester for f in rows]
    return sorted(users, key=lambda u: u.username.lower())


async def unfriend(db: AsyncSession, me: User, user_id: int) -> None:
    f = await get_between(db, me.id, user_id)
    if f is None or f.status != FriendshipStatus.accepted:
        raise FriendError(404, "Not friends")
    await db.delete(f)
    await db.commit()
