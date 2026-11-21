# SPDX-License-Identifier: AGPL-3.0-or-later
"""NPCs piloted on the map as in-world time advances, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.WorldTick import (  # type: ignore[import-not-found]
    arrivals,
    last_seen_after,
    last_seen_lines,
    routine_slot,
    tick_moves,
    tick_options,
    tick_questions,
    tick_state,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "world-tick-cases.json").read_text())
PERSONS, LOCATIONS, CLOCK = CASES["persons"], CASES["locations"], CASES["clock"]
VARDANE = PERSONS[0]


@pytest.mark.parametrize("case", CASES["slot_cases"], ids=[case["name"] for case in CASES["slot_cases"]])
def test_the_routine_slot(case: dict[str, Any]) -> None:
    routine = case["routine"] if "routine" in case else VARDANE["routine"]
    assert (routine_slot(routine, case["clock"]) or {}).get("location_id") == case["location_id"]


def test_the_options() -> None:
    assert tick_options(VARDANE, LOCATIONS, CLOCK) == CASES["options_case"]["options"]


def test_the_questions() -> None:
    expected = CASES["questions_case"]
    questions, picks, fallbacks = tick_questions(PERSONS, LOCATIONS, CLOCK, expected["still"])
    assert (questions, picks, fallbacks) == (expected["questions"], expected["picks"], expected["fallbacks"])


@pytest.mark.parametrize("case", CASES["move_cases"], ids=[case["name"] for case in CASES["move_cases"]])
def test_the_moves(case: dict[str, Any]) -> None:
    _questions, picks, fallbacks = tick_questions(PERSONS, LOCATIONS, CLOCK, CASES["questions_case"]["still"])
    assert tick_moves(case["answers"], picks, fallbacks, PERSONS) == case["moves"]


@pytest.mark.parametrize("case", CASES["arrival_cases"], ids=[case["name"] for case in CASES["arrival_cases"]])
def test_the_arrivals(case: dict[str, Any]) -> None:
    assert arrivals(case["moves"], case["scene"], LOCATIONS) == case["arrivals"]


@pytest.mark.parametrize("case", CASES["state_cases"], ids=[str(case["place"]) for case in CASES["state_cases"]])
def test_the_state(case: dict[str, Any]) -> None:
    assert tick_state(CLOCK, case["place"]) == case["state"]


def test_what_the_party_last_saw() -> None:
    seen = CASES["last_seen_case"]
    assert last_seen_after(seen["before"], seen["present"], seen["location_of"], CLOCK) == seen["after"]
    assert last_seen_lines(seen["after"], PERSONS, seen["present"], LOCATIONS) == seen["lines"]
