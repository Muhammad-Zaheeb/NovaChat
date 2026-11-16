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
