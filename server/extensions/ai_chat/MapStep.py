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
        "seat_location": (
            {"id": place["id"], "name": place["name"], "chain": place_chain(place, locations)}
            if place is not None
            else None
        ),
        "seat_moved": any(move["from"] != move["to"] for move in own),
    }


def place_chain(place: Mapping[str, Any], locations: Sequence[Mapping[str, Any]]) -> list[str]:
    """A place's chain up to its top (the operator, 2026-11-23: "Locations are fully qualified": the
    banner's subtitle, up to the planet or system in 40k and the region in D&D), nearest first."""
    by_id = {str(location["id"]): location for location in locations}
    chain: list[str] = []
    seen = {str(place["id"])}
    parent = place.get("parent_id")
    while parent is not None and str(parent) in by_id and str(parent) not in seen:
        seen.add(str(parent))
        above = by_id[str(parent)]
        chain.append(str(above["name"]))
        parent = above.get("parent_id")
    return chain


def scene_changed(previous: str | None, current: Mapping[str, Any] | None) -> bool:
    """Whether the banner shows (the operator, 2026-11-23: "The location banner marks a scene change in
    the VTT only (a new map, including another level), never moving within a scene"): the current
    scene isn't the one the chat last saw."""
    if current is None or not current.get("id"):
        return False
    return previous != str(current["id"])


SCENE: dict[str, Any] = MAP_STEP["scene"]


def _named(text: str, person: Mapping[str, Any]) -> bool:
    lowered = text.lower()
    names = [str(person.get("name") or ""), *(str(alias) for alias in person.get("aliases") or [])]
    return any(
        name.strip() and re.search(rf"(?<![\w']){re.escape(name.strip().lower())}(?![\w'])", lowered) for name in names
    )


def scene_questions(
    text: str, people: Sequence[Mapping[str, Any]], on_scene: Sequence[str], seat: str | None
) -> dict[str, dict[str, Any]]:
    """One question per person the round's lines name (the seat's own character aside: the player moves
    them): on the scene, whether they're still here; off it, whether they've arrived. None named, none."""
    here = set(on_scene)
    questions: dict[str, dict[str, Any]] = {}
    for person in people:
        if str(person["id"]) == seat or not _named(text, person):
            continue
        present = str(person["id"]) in here
        template = SCENE["stay_question"] if present else SCENE["arrive_question"]
        options = [SCENE["stays"], SCENE["leaves"]] if present else [SCENE["arrives"], SCENE["absent"]]
        questions[f"scene_{person['id']}"] = {
            "type": "choice",
            "instructions": str(template).replace("{{name}}", str(person["name"])),
            "criteria": {str(option): str(SCENE["meanings"][option]) for option in options},
        }
    return questions


# Leaving said in so many words, read without a model (the live run, 2026-11-24: after the GM sent Old Hesk away,
# the decision model answered "still here" at 0.97 for every scene step, and his token stayed). A sentence that
# names the person (or a pronoun right after naming them) with one of these, and no negation, is a departure.
LEAVING = re.compile(
    r"\b(leaves|left|departs?|departed|goes off|went off|walks? (?:off|away|out)|walked (?:off|away|out)|"
    r"heads? (?:off|away|out|back)|headed (?:off|away|out|back)|is sent (?:away|off)|was sent (?:away|off)|"
    r"sends? (?:\w+ )?(?:away|off)|"
    r"poles? (?:the \w+ )?(?:away|back|off)|poled (?:the \w+ )?(?:away|back|off)|exits?|exited|vanish(?:es|ed)|"
    r"disappears?|disappeared|is gone|out of sight|takes? (?:his|her|their) leave|took (?:his|her|their) leave)\b",
    re.IGNORECASE,
)
NEGATED = re.compile(
    r"\b(not|n't|never|refuses?|refused|won't|wouldn't|doesn't|didn't|stays?|stayed|remains?)\b", re.IGNORECASE
)


def departures(text: str, people: Sequence[Mapping[str, Any]], on_scene: Sequence[str], seat: str | None) -> list[str]:
    """The people on the scene whom the lines plainly send away: a sentence naming them (or, right after a
    sentence naming them, one whose subject is a pronoun) with a leaving phrase and no negation."""
    here = set(on_scene)
    sentences = [one.strip() for one in re.split(r"(?<=[.!?])\s+|\n+", text) if one.strip()]
    gone: list[str] = []
    for person in people:
        pid = str(person["id"])
        if pid == seat or pid not in here:
            continue
        last_named = False
        for sentence in sentences:
            named = _named(sentence, person)
            pronoun_led = re.match(r"^(he|she|they)\b", sentence, re.IGNORECASE) is not None
            if (named or (last_named and pronoun_led)) and LEAVING.search(sentence) and not NEGATED.search(sentence):
                gone.append(pid)
                break
            last_named = named or (last_named and pronoun_led)
    return gone


def scene_changes(answers: Mapping[str, Any] | None, questions: Mapping[str, Any]) -> list[dict[str, str]]:
    """The scene moves the answers make: {person_id, change: "left" | "arrived"}; staying is none."""
    changes: list[dict[str, str]] = []
    for key in questions:
        answer = (answers or {}).get(key)
        choice = answer.get("choice") if isinstance(answer, Mapping) else None
        person_id = key.removeprefix("scene_")
        if choice == SCENE["leaves"]:
            changes.append({"person_id": person_id, "change": "left"})
        elif choice == SCENE["arrives"]:
            changes.append({"person_id": person_id, "change": "arrived"})
    return changes
