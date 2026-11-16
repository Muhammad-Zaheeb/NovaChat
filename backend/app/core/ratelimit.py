"""Tiny in-memory sliding-window limiter (per process; fine for a single-instance deploy)."""
import time
from collections import defaultdict, deque

_hits: dict[tuple[str, int], deque[float]] = defaultdict(deque)


def allow(bucket: str, user_id: int, limit: int, window: float = 60.0) -> bool:
    now = time.monotonic()
    q = _hits[(bucket, user_id)]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def reset() -> None:
    _hits.clear()


# ---- Auth throttling -------------------------------------------------------
# A small interface (`Limiter`) so the in-process store can be swapped for Redis later.
import math  # noqa: E402

from fastapi import HTTPException, Request  # noqa: E402

from app.core.config import settings  # noqa: E402


class Limiter:
    def retry_after(self, key: str, limit: int, window: float) -> int:
        """Seconds until `key` may act again, or 0 if it is under `limit` events per `window`."""
        raise NotImplementedError

    def hit(self, key: str, window: float) -> None:
        """Record one event for `key`."""
        raise NotImplementedError

    def clear(self, key: str) -> None:
        raise NotImplementedError

    def reset(self) -> None:
        raise NotImplementedError


class MemoryLimiter(Limiter):
    """Sliding window, per process (fine for the single-worker deploy)."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def _trim(self, key: str, window: float) -> deque[float]:
        now = time.monotonic()
        q = self._events[key]
        while q and now - q[0] > window:
            q.popleft()
        if not q:
            self._events.pop(key, None)
            q = self._events[key]
        if now - self._last_sweep > 600:  # drop idle keys so memory stays bounded
            self._last_sweep = now
            for k in [k for k, v in self._events.items() if not v or now - v[-1] > 3600 * 24]:
                self._events.pop(k, None)
        return q

    def retry_after(self, key: str, limit: int, window: float) -> int:
        q = self._trim(key, window)
        if len(q) < limit:
            return 0
        return max(1, math.ceil(window - (time.monotonic() - q[len(q) - limit])))

    def hit(self, key: str, window: float) -> None:
        self._trim(key, window).append(time.monotonic())

    def clear(self, key: str) -> None:
        self._events.pop(key, None)

    def reset(self) -> None:
        self._events.clear()


limiter: Limiter = MemoryLimiter()
_reset_base = reset


def reset() -> None:  # noqa: F811
    _reset_base()
    limiter.reset()


def client_ip(request: Request) -> str:
    """The caller's IP. X-Forwarded-For is honoured only with TRUST_PROXY, and then the entry
    appended by our own proxy (counted from the right) is used, since the left side is client-controlled."""
    if settings.TRUST_PROXY:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        hops = max(1, settings.TRUSTED_PROXY_HOPS)
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


def _humanize(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} seconds"
    return f"{math.ceil(seconds / 60)} minutes"


def too_many(seconds: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=f"Too many attempts. Please try again in {_humanize(seconds)}.",
        headers={"Retry-After": str(seconds)},
    )


def enforce(key: str, limit: int, window: float, count: bool = True) -> None:
    """Raise 429 if `key` is over the limit; otherwise (optionally) record this event."""
    wait = limiter.retry_after(key, limit, window)
    if wait:
        raise too_many(wait)
    if count:
        limiter.hit(key, window)
