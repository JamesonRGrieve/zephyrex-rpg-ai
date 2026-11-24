# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fully asynchronous turns (the operator, 2026-11-23): the server runs a turn on its own; a subscriber
that drops changes nothing, a reconnect replays it, Stop interrupts it."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from zephyrex.extensions.ai_chat import Turns  # type: ignore[import-not-found]

BEAT = ": keepalive\n\n"


def _error(error: BaseException) -> str:
    return f"event: error\ndata: {error}\n\n"


async def _read(turn: Turns.Turn, start: int = 0) -> list[str]:
    return [piece async for piece in turn.follow(start, BEAT, 0.05)]


@pytest.fixture(autouse=True)
def _fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Turns, "_TURNS", {})


def test_a_turn_runs_without_a_subscriber_and_a_reconnect_replays_it() -> None:
    async def scenario() -> None:
        async def run() -> AsyncIterator[str]:
            async def pieces() -> AsyncIterator[str]:
                for piece in ("a", BEAT, "b", "done"):
                    await asyncio.sleep(0.01)
                    yield piece

            return pieces()

        turn = Turns.start_turn("u1", "c1", run, BEAT, _error, "stopped")
        assert turn is not None
        # Nobody follows it; it finishes all the same.
        assert turn.task is not None
        await asyncio.wait_for(asyncio.shield(turn.task), timeout=2)
        assert turn.done and turn.frames == ["a", "b", "done"]
        assert await _read(turn) == ["a", "b", "done"]
        assert await _read(turn, 2) == ["done"]

    asyncio.run(scenario())


def test_one_turn_at_a_time_and_stop_interrupts_it() -> None:
    async def scenario() -> None:
        async def run() -> AsyncIterator[str]:
            async def pieces() -> AsyncIterator[str]:
                yield "a"
                await asyncio.sleep(30)
                yield "never"

            return pieces()

        turn = Turns.start_turn("u1", "c1", run, BEAT, _error, "stopped")
        assert turn is not None
        await asyncio.sleep(0.05)
        assert Turns.start_turn("u1", "c1", run, BEAT, _error, "stopped") is None
        follower = asyncio.ensure_future(_read(turn))
        await asyncio.sleep(0.12)
        assert Turns.stop_turn("u1", "c1")
        seen = await asyncio.wait_for(follower, timeout=2)
        assert seen[0] == "a" and seen[-1] == "stopped" and BEAT in seen
        assert not Turns.stop_turn("u1", "c1")
        # Another person's chat of the same id is their own.
        assert Turns.turn_of("u2", "c1") is None

    asyncio.run(scenario())


def test_a_failed_turn_says_so_and_ends() -> None:
    async def scenario() -> None:
        async def run() -> AsyncIterator[str]:
            raise RuntimeError("no model")

        turn = Turns.start_turn("u1", "c1", run, BEAT, _error, "stopped")
        assert turn is not None
        assert await asyncio.wait_for(_read(turn), timeout=2) == ["event: error\ndata: no model\n\n"]

    asyncio.run(scenario())


def test_a_turn_says_where_it_has_got_to() -> None:
    # The operator, 2026-11-24: Stop "can't disappear mid generation or while waiting for formatting".
    async def run() -> list[str]:
        turn = Turns.Turn("c1")
        seen = [turn.stage]
        turn.add('event: delta\ndata: {"text": "Rain"}\n\n')
        seen.append(turn.stage)
        turn.add('event: stage\ndata: {"stage": "formatting"}\n\n')
        seen.append(turn.stage)
        turn.add('event: stage\ndata: {"stage": "saving"}\n\n')
        seen.append(turn.stage)
        return seen

    assert asyncio.run(run()) == ["generating", "generating", "formatting", "saving"]
