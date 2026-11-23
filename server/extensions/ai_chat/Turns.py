# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fully asynchronous turns (the operator, 2026-11-23: "Send makes two requests. One posts the turn and
returns at once; the server processes it entirely on its own. The other subscribes to its stream;
dropping that subscription has no effect on the server's work, and on reconnecting the result is
there. Stop is its own request that interrupts the server.").

A turn is the reply's stream run as a server task whose frames are kept in order: a subscriber reads
them from any index (from 0 on reconnecting, so it gets the whole reply) and then follows live; one
that drops changes nothing. A finished turn is kept for ``KEEP_SECONDS`` so a late reconnect still
finds it. One turn at a time per person and chat.

Process-local: the server runs one worker (zephyrex.run's default), so the turn and its subscribers
meet in the same process.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

#: How long a finished turn's frames stay for a reconnect.
KEEP_SECONDS = 900.0


class Turn:
    """One turn's frames, in order, and whether it has finished."""

    def __init__(self, chat_id: str) -> None:
        self.id = str(uuid.uuid4())
        self.chat_id = chat_id
        self.frames: list[str] = []
        self.done = False
        self.finished_at: float | None = None
        self.task: asyncio.Task[Any] | None = None
        self._changed = asyncio.Event()

    def add(self, piece: str) -> None:
        self.frames.append(piece)
        self._wake()

    def finish(self) -> None:
        self.done = True
        self.finished_at = time.monotonic()
        self._wake()

    def _wake(self) -> None:
        changed, self._changed = self._changed, asyncio.Event()
        changed.set()

    async def follow(self, start: int, heartbeat: str, interval: float) -> AsyncIterator[str]:
        """The frames from ``start``, then each as it comes, a heartbeat in any pause, until the turn ends."""
        index = max(0, start)
        while True:
            while index < len(self.frames):
                yield self.frames[index]
                index += 1
            if self.done:
                return
            changed = self._changed
            try:
                await asyncio.wait_for(changed.wait(), timeout=interval)
            except TimeoutError:
                yield heartbeat


_TURNS: dict[tuple[str, str], Turn] = {}


def _forget_old() -> None:
    now = time.monotonic()
    for key, turn in list(_TURNS.items()):
        if turn.done and turn.finished_at is not None and now - turn.finished_at > KEEP_SECONDS:
            del _TURNS[key]


def turn_of(requester_id: str, chat_id: str) -> Turn | None:
    """The person's turn on a chat, running or finished (until it's forgotten), or None."""
    _forget_old()
    return _TURNS.get((requester_id, chat_id))


def start_turn(
    requester_id: str,
    chat_id: str,
    run: Callable[[], Awaitable[AsyncIterator[str]]],
    heartbeat: str,
    on_error: Callable[[BaseException], str],
    on_stop: str,
) -> Turn | None:
    """A turn begun as a server task, its frames kept (heartbeats aren't); None while another runs."""
    running = turn_of(requester_id, chat_id)
    if running is not None and not running.done:
        return None
    turn = Turn(chat_id)
    _TURNS[(requester_id, chat_id)] = turn

    async def body() -> None:
        pieces: AsyncIterator[str] | None = None
        try:
            pieces = await run()
            async for piece in pieces:
                if piece != heartbeat:
                    turn.add(piece)
        except asyncio.CancelledError:
            turn.add(on_stop)
        except Exception as error:  # a failed turn says so to its subscribers, then ends
            turn.add(on_error(error))
        finally:
            closing = getattr(pieces, "aclose", None)
            if closing is not None:
                try:
                    await closing()
                except Exception:  # the stream's own cleanup (the upstream client) never stops the end
                    pass
            turn.finish()

    turn.task = asyncio.ensure_future(body())
    return turn


def stop_turn(requester_id: str, chat_id: str) -> bool:
    """The person's running turn on a chat interrupted on the server; False when none runs."""
    turn = turn_of(requester_id, chat_id)
    if turn is None or turn.done or turn.task is None:
        return False
    turn.task.cancel()
    return True
