# SPDX-License-Identifier: AGPL-3.0-or-later
"""The map follows the story (the operator, 2026-11-21): after a round, each person whose do line moves them
is asked where they now are, among real places only (WorldTick's options). No movement, no model call.

The twin of client/src/features/world/mapStep.ts, held to contract/map-step-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.WorldTick import tick_options  # type: ignore[import-not-found]

MAP_STEP: dict[str, Any] = CONTRACT["map_step"]


def movers(items: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    """Each person whose do lines move them, with what they did (their do lines joined)."""
    found: dict[str, list[str]] = {}
    for item in items:
        if item["kind"] != "do" or item["speaker_id"] is None:
            continue
        words = re.split(r"[^\w']+|[\d_]+", str(item["text"]).lower())
        if not any(word in words for word in MAP_STEP["movement_words"]):
            continue
        found.setdefault(str(item["speaker_id"]), []).append(str(item["text"]))
    return [{"id": id_, "action": " ".join(actions)} for id_, actions in found.items()]


def map_questions(
    moving: Sequence[Mapping[str, str]],
    persons: Sequence[Mapping[str, Any]],
    locations: Sequence[Mapping[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]], dict[str, str | None]]:
    """One question per mover, what each option picks (a location id), and staying as the fallback."""
    real = {location["id"]: location for location in locations}
    questions: dict[str, dict[str, Any]] = {}
    picks: dict[str, dict[str, str]] = {}
    fallbacks: dict[str, str | None] = {}
    for mover in moving:
        person = next((one for one in persons if one["id"] == mover["id"]), None)
        if person is None:
            continue
        here = person.get("location_id")
        options = tick_options(
            {**person, "routine": None, "motivations": [mover["action"]]}, locations, {"day": 1, "time": "00:00"}
        )
        if len(options) < (1 if here is None else 2):
            continue
        labels: dict[str, str] = {}
        for id_ in options:
            place = str(real[id_]["name"]) if id_ in real else id_
            label, count = (f"Stay at {place}" if id_ == here else place), 2
            while label in labels:
                label, count = f"{place} ({count})", count + 1
            labels[label] = id_
        questions[mover["id"]] = {
            "type": "choice",
            "instructions": MAP_STEP["instructions"]
            .replace("{{name}}", str(person["name"]))
            .replace("{{action}}", mover["action"]),
            "criteria": list(labels),
        }
        picks[mover["id"]] = labels
        fallbacks[mover["id"]] = here
    return questions, picks, fallbacks


def seat_place(
    seat_id: str | None,
    persons: Sequence[Mapping[str, Any]],
    locations: Sequence[Mapping[str, Any]],
    moves: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Where the seat's character is after the round's moves, and whether this round moved them.

    The banner's place (the operator, 2026-11-21): server truth, never the narrator's word.
    """
    if seat_id is None:
        return {"seat_location": None, "seat_moved": False}
    own = [move for move in moves if move["person_id"] == seat_id]
    listed = next((person.get("location_id") for person in persons if person["id"] == seat_id), None)
    at = own[-1]["to"] if own else listed
    place = next((location for location in locations if location["id"] == at), None) if at is not None else None
    return {
        "seat_location": {"id": place["id"], "name": place["name"]} if place is not None else None,
        "seat_moved": any(move["from"] != move["to"] for move in own),
    }
