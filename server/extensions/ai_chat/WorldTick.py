# SPDX-License-Identifier: AGPL-3.0-or-later
"""NPCs piloted on the map as in-world time advances (the operator, 2026-11-21): on a tick each NPC that
isn't present and isn't the seat gets bounded options, every one a real wiki location (stay, its routine
slot now, its location's parent, children and siblings, places its motivations name); the decision model
picks one per NPC, and with no answer it follows its routine slot, else stays. Players know only where
they last saw someone.

The twin of client/src/features/world/worldTick.ts, held to contract/world-tick-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

WORLD_TICK: dict[str, Any] = CONTRACT["world_tick"]


def _names(text: str, location: Mapping[str, Any]) -> bool:
    for name in [location["name"], *(location.get("aliases") or [])]:
        name = str(name).strip()
        if name and re.search(rf"(?<![^\W_]){re.escape(name)}(?![^\W_])", text, re.IGNORECASE):
            return True
    return False


def _minutes(time: str) -> int:
    hours, _, mins = time.partition(":")
    return int(hours or 0) * 60 + int(mins or 0)


def _on_day(slot: Mapping[str, Any], day: int) -> bool:
    days = slot.get("days")
    # 0 is Monday, and the campaign's day 1 a Monday (the wiki's clock).
    return days is None or (day - 1) % 7 in days


def routine_slot(routine: Sequence[Mapping[str, Any]] | None, clock: Mapping[str, Any]) -> dict[str, Any] | None:
    """The routine slot running at a time: the first that holds it (an overnight slot counts from its start day)."""
    now = _minutes(clock["time"])
    for slot in routine or []:
        start, end = _minutes(slot["from"]), _minutes(slot["to"])
        if start <= end:
            running = start <= now < end and _on_day(slot, clock["day"])
        else:
            late = now >= start and _on_day(slot, clock["day"])
            running = late or (now < end and _on_day(slot, clock["day"] - 1))
        if running:
            return dict(slot)
    return None


def tick_options(
    person: Mapping[str, Any], locations: Sequence[Mapping[str, Any]], clock: Mapping[str, Any]
) -> list[str]:
    """Where an NPC may go on this tick: real location ids only, stay first, at most max_options."""
    real = {location["id"]: location for location in locations}
    here = person.get("location_id")
    parent = real[here].get("parent_id") if here in real else None
    slot = routine_slot(person.get("routine"), clock)
    wanted = [
        here,
        slot.get("location_id") if slot else None,
        parent,
        *[location["id"] for location in locations if here is not None and location.get("parent_id") == here],
        *[
            location["id"]
            for location in locations
            if parent is not None and location.get("parent_id") == parent and location["id"] != here
        ],
        *[
            location["id"]
            for location in locations
            if any(_names(str(motivation), location) for motivation in person.get("motivations") or [])
        ],
    ]
    options: list[str] = []
    for id_ in wanted:
        if id_ is not None and id_ in real and id_ not in options:
            options.append(id_)
    return options[: int(WORLD_TICK["max_options"])]


def tick_questions(
    persons: Sequence[Mapping[str, Any]],
    locations: Sequence[Mapping[str, Any]],
    clock: Mapping[str, Any],
    still: Sequence[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]], dict[str, str | None]]:
    """The decision model's questions (one per NPC that may move), what each option picks, and where each
    NPC goes without an answer (its routine slot, else where it is)."""
    real = {location["id"]: location for location in locations}
    questions: dict[str, dict[str, Any]] = {}
    picks: dict[str, dict[str, str]] = {}
    fallbacks: dict[str, str | None] = {}
    movable = [person for person in persons if person["id"] not in still][: int(WORLD_TICK["max_npcs"])]
    for person in movable:
        options = tick_options(person, locations, clock)
        if not options:
            continue
        here = person.get("location_id")
        labels: dict[str, str] = {}
        for id_ in options:
            place = str(real[id_]["name"]) if id_ in real else id_
            base = WORLD_TICK["stay"].replace("{{place}}", place) if id_ == here else place
            label, count = base, 2
            while label in labels:
                label, count = f"{base} ({count})", count + 1
            labels[label] = id_
        slot = routine_slot(person.get("routine"), clock)
        activity = str((slot or {}).get("activity") or "").strip()
        wants = [str(want).strip() for want in person.get("motivations") or [] if str(want).strip()]
        wanting = WORLD_TICK["motivations"].replace("{{motivations}}", "; ".join(wants)) if wants else ""
        instructions = (
            WORLD_TICK["instructions"]
            .replace("{{day}}", str(clock["day"]))
            .replace("{{time}}", str(clock["time"]))
            .replace("{{name}}", str(person["name"]))
            .replace("{{activity}}", WORLD_TICK["activity"].replace("{{activity}}", activity) if activity else "")
            .replace("{{motivations}}", wanting)
        )
        questions[person["id"]] = {"type": "choice", "instructions": instructions, "criteria": list(labels)}
        picks[person["id"]] = labels
        routed = (slot or {}).get("location_id")
        fallbacks[person["id"]] = routed if routed in real else here
    return questions, picks, fallbacks


def tick_moves(
    answers: Mapping[str, Any] | None,
    picks: Mapping[str, Mapping[str, str]],
    fallbacks: Mapping[str, str | None],
    persons: Sequence[Mapping[str, Any]],
) -> list[dict[str, str | None]]:
    """The moves the answers make: each NPC to its pick, or its fallback; staying put is no move."""
    moves: list[dict[str, str | None]] = []
    for person in persons:
        options = picks.get(person["id"])
        if options is None:
            continue
        answer = (answers or {}).get(person["id"])
        picked = options.get(str(answer["choice"])) if isinstance(answer, Mapping) and "choice" in answer else None
        to = picked or fallbacks.get(person["id"])
        origin = person.get("location_id")
        if to is not None and to != origin:
            moves.append({"person_id": person["id"], "from": origin, "to": to})
    return moves


def _inside(location: str | None, scene: str, parents: Mapping[str, str | None]) -> bool:
    at = location
    for _step in range(32):
        if at is None:
            return False
        if at == scene:
            return True
        at = parents.get(at)
    return False


def arrivals(
    moves: Sequence[Mapping[str, Any]], scene_location: str | None, locations: Sequence[Mapping[str, Any]]
) -> list[str]:
    """Who a tick brings into the party's scene (to narrate their arrival): moved there from outside it."""
    if scene_location is None:
        return []
    parents = {location["id"]: location.get("parent_id") for location in locations}
    return [
        str(move["person_id"])
        for move in moves
        if _inside(move["to"], scene_location, parents) and not _inside(move["from"], scene_location, parents)
    ]


def tick_state(clock: Mapping[str, Any], party_place: str | None) -> str:
    """What the decision model reads on a tick: the time and where the party is."""
    return str(
        WORLD_TICK["state"]
        .replace("{{day}}", str(clock["day"]))
        .replace("{{time}}", str(clock["time"]))
        .replace("{{place}}", party_place if party_place is not None else WORLD_TICK["nowhere"])
    )


def last_seen_after(
    last_seen: Mapping[str, Any],
    present: Sequence[str],
    location_of: Mapping[str, str | None],
    clock: Mapping[str, Any],
) -> dict[str, Any]:
    """The chat's last-seen record after a turn: each person present now is seen where they are now."""
    seen = dict(last_seen)
    for id_ in present:
        seen[id_] = {"location_id": location_of.get(id_), "day": clock["day"], "time": clock["time"]}
    return seen


def last_seen_lines(
    last_seen: Mapping[str, Any],
    persons: Sequence[Mapping[str, Any]],
    present: Sequence[str],
    locations: Sequence[Mapping[str, Any]],
) -> list[str]:
    """The lines a character's voice reads about those not present: where each was last seen."""
    named = {location["id"]: str(location["name"]) for location in locations}
    lines: list[str] = []
    for person in persons:
        seen = last_seen.get(person["id"])
        if person["id"] in present or seen is None or seen.get("location_id") not in named:
            continue
        place = named[seen["location_id"]]
        lines.append(WORLD_TICK["last_seen"].replace("{{name}}", str(person["name"])).replace("{{place}}", place))
    return lines
