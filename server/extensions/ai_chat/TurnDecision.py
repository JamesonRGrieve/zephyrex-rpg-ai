# SPDX-License-Identifier: AGPL-3.0-or-later
"""Who speaks next, by the decision model (the operator, 2026-11-21): a choice among the cast the AI
plays (unmuted, never the person's seat), the AI GM interjecting (not when the person is the GM), or a
pause for the person's input; what the model is told depends on the person's seat.

The twin of client/src/features/chat/turnDecision.ts, held to contract/turn-decision-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

DECIDE_TURN: dict[str, Any] = CONTRACT["decide_turn"]
PRESENCE: dict[str, Any] = DECIDE_TURN["presence"]


def _names(text: str, name: str) -> bool:
    """Whether a line names a member: their full name or their first name, as a whole word."""
    full = name.strip()
    first = full.split()[0] if full.split() else ""
    words = [full, *([first] if len(first) >= 3 and first != full else [])]
    return any(
        word and re.search(rf"(^|[^\w]|_){re.escape(word)}($|[^\w]|_)", text, re.IGNORECASE) is not None
        for word in words
    )


def _inside(location: str, scene: str, parents: Mapping[str, str | None]) -> bool:
    at: str | None = location
    for _step in range(32):
        if at is None:
            return False
        if at == scene:
            return True
        at = parents.get(at)
    return False


def present_cast(cast: Sequence[Mapping[str, Any]], presence: Mapping[str, Any]) -> dict[str, list[str]]:
    """Who is in the scene and who a line reaches by vox: a token in the VTT scene when one is set;
    else a wiki location at or inside the scene's; else they spoke or were named in the recent lines.
    Away but on vox: reached when the last line names them or a vox word."""
    recent = list(presence["recent"])[-int(PRESENCE["recent"]) :]
    tokens = presence["tokens"]
    scene = presence["scene_location"]

    def here(member: Mapping[str, Any]) -> bool:
        if tokens is not None:
            return member["id"] in tokens
        location = presence["person_locations"].get(member["id"])
        if scene is not None and location is not None:
            return _inside(location, scene, presence["location_parents"])
        return any(line["speaker_id"] == member["id"] or _names(line["text"], member["name"]) for line in recent)

    last = recent[-1]["text"] if recent else ""
    vox_called = any(_names(last, word) for word in PRESENCE["vox_words"])
    present = [str(member["id"]) for member in cast if here(member)]
    vox = [
        str(member["id"])
        for member in cast
        if member["id"] not in present
        and member["id"] in presence["vox"]
        and (vox_called or _names(last, member["name"]))
    ]
    return {"present": present, "vox": vox}


def turn_seat(chat_seat: str | None, playing: bool) -> str:
    """The person's seat: the GM's, a character's, or none."""
    if chat_seat == "gm":
        return "gm"
    return "character" if chat_seat == "player" or playing else "none"


def turn_question(
    cast: Sequence[Mapping[str, Any]],
    muted: Sequence[str],
    seated_id: str | None,
    seat: str,
    player: str,
    reachable: Sequence[str] | None = None,
    after_person: bool = False,
) -> tuple[dict[str, Any], dict[str, dict[str, str]]]:
    """The decision model's question, and what each of its options picks. With ``reachable``, only those
    cast members are options; after the person's own line there is no pause, so someone answers."""

    def fill(text: str) -> str:
        return text.replace("{{player}}", player)

    picks: dict[str, dict[str, str]] = {}
    for member in cast:
        if member["id"] in muted or member["id"] == seated_id:
            continue
        if reachable is not None and member["id"] not in reachable:
            continue
        base = str(member["name"]).strip() or "Someone"
        name, count = base, 2
        while name in picks:
            name, count = f"{base} ({count})", count + 1
        picks[name] = {"kind": "character", "id": str(member["id"])}
    if seat != "gm":
        picks[DECIDE_TURN["gm"]] = {"kind": "gm"}
    if not after_person:
        picks[fill(DECIDE_TURN["pause"][seat])] = {"kind": "pause"}
    instructions = fill(DECIDE_TURN["instructions"][seat]) + ("" if reachable is None else PRESENCE["rule"])
    question = {"type": "choice", "instructions": instructions, "criteria": list(picks)}
    return question, picks


def turn_pick(answer: Mapping[str, Any] | None, picks: Mapping[str, Mapping[str, str]]) -> dict[str, str] | None:
    """What the decision model's answer picks, or None when it named no option."""
    if not isinstance(answer, Mapping) or "choice" not in answer:
        return None
    pick = picks.get(str(answer["choice"]))
    return dict(pick) if pick is not None else None


def turn_state(lines: Sequence[Mapping[str, str]], scene: Mapping[str, Any] | None = None) -> str:
    """What the decision model reads: the scene and who is in it (when known), then the story's last
    lines, each "Name: text"."""
    story = "\n".join(f"{line['name']}: {line['text']}" for line in list(lines)[-int(DECIDE_TURN["window"]) :])
    if scene is None:
        return story

    def listed(names: Sequence[str]) -> str:
        return ", ".join(names) if names else str(PRESENCE["nobody"])

    header = [
        *([PRESENCE["scene"] + scene["place"]] if scene["place"] is not None else []),
        PRESENCE["present"] + listed(scene["present"]),
        *([PRESENCE["vox"] + listed(scene["vox"])] if scene["vox"] else []),
    ]
    return "\n".join(header) + "\n\n" + story
