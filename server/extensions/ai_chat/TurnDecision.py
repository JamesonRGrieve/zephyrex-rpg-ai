# SPDX-License-Identifier: AGPL-3.0-or-later
"""Who speaks next, by the decision model (the operator, 2026-11-21): a choice among the cast the AI
plays (unmuted, never the person's seat), the AI GM interjecting (not when the person is the GM), or a
pause for the person's input; what the model is told depends on the person's seat.

The twin of client/src/features/chat/turnDecision.ts, held to contract/turn-decision-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

DECIDE_TURN: dict[str, Any] = CONTRACT["decide_turn"]


def turn_seat(chat_seat: str | None, playing: bool) -> str:
    """The person's seat: the GM's, a character's, or none."""
    if chat_seat == "gm":
        return "gm"
    return "character" if chat_seat == "player" or playing else "none"


def turn_question(
    cast: Sequence[Mapping[str, Any]], muted: Sequence[str], seated_id: str | None, seat: str, player: str
) -> tuple[dict[str, Any], dict[str, dict[str, str]]]:
    """The decision model's question, and what each of its options picks."""

    def fill(text: str) -> str:
        return text.replace("{{player}}", player)

    picks: dict[str, dict[str, str]] = {}
    for member in cast:
        if member["id"] in muted or member["id"] == seated_id:
            continue
        base = str(member["name"]).strip() or "Someone"
        name, count = base, 2
        while name in picks:
            name, count = f"{base} ({count})", count + 1
        picks[name] = {"kind": "character", "id": str(member["id"])}
    if seat != "gm":
        picks[DECIDE_TURN["gm"]] = {"kind": "gm"}
    picks[fill(DECIDE_TURN["pause"][seat])] = {"kind": "pause"}
    question = {"type": "choice", "instructions": fill(DECIDE_TURN["instructions"][seat]), "criteria": list(picks)}
    return question, picks


def turn_pick(answer: Mapping[str, Any] | None, picks: Mapping[str, Mapping[str, str]]) -> dict[str, str] | None:
    """What the decision model's answer picks, or None when it named no option."""
    if not isinstance(answer, Mapping) or "choice" not in answer:
        return None
    pick = picks.get(str(answer["choice"]))
    return dict(pick) if pick is not None else None


def turn_state(lines: Sequence[Mapping[str, str]]) -> str:
    """The recent story the decision model reads: its last lines, each "Name: text"."""
    return "\n".join(f"{line['name']}: {line['text']}" for line in list(lines)[-int(DECIDE_TURN["window"]) :])
