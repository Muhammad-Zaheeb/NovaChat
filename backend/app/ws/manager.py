"""Connection manager behind a small interface.

NOTE: the in-memory implementation is single-process only. With several
workers/instances a user's sockets can live in another process, so deploy
(Phase 6) swaps in a Redis pub/sub backed implementation of the same
interface; handlers only use `send_to_users`, `connect`, `disconnect`
and `filter_online`.
"""
import asyncio
from collections.abc import Iterable
from typing import Protocol

from fastapi import WebSocket


class Broadcaster(Protocol):
    async def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register a socket. True if it is the user's first (user came online)."""

    async def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Remove a socket. True if it was the user's last (user went offline)."""

    async def send_to_users(self, user_ids: Iterable[int], event: dict) -> None: ...

    async def filter_online(self, user_ids: Iterable[int]) -> set[int]: ...


class ConnectionManager:
    def __init__(self) -> None:
        self._conns: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> bool:
        socks = self._conns.setdefault(user_id, set())
        socks.add(ws)
        return len(socks) == 1

    async def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        socks = self._conns.get(user_id)
        if not socks or ws not in socks:
            return False
        socks.discard(ws)
        if socks:
            return False
        del self._conns[user_id]
        return True

    async def send_to_users(self, user_ids: Iterable[int], event: dict) -> None:
        targets = [ws for uid in set(user_ids) for ws in self._conns.get(uid, ())]
        # a dead socket must not block the others; its receive loop cleans it up
        await asyncio.gather(*(ws.send_json(event) for ws in targets), return_exceptions=True)

    async def filter_online(self, user_ids: Iterable[int]) -> set[int]:
        return {u for u in user_ids if u in self._conns}


manager: Broadcaster = ConnectionManager()
