# SPDX-License-Identifier: AGPL-3.0-or-later
"""The map following the story, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.MapStep import (  # type: ignore[import-not-found]
    departures,
    map_questions,
    movers,
    scene_changed,
    scene_changes,
    scene_questions,
    seat_place,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "map-step-cases.json").read_text())


def test_who_moved() -> None:
    assert movers(CASES["items"]) == CASES["movers"]
    assert movers(CASES["no_movement_items"]) == []


def test_the_questions() -> None:
    questions, picks, fallbacks = map_questions(CASES["movers"], CASES["persons"], CASES["locations"])
    assert (questions, picks, fallbacks) == (CASES["questions"], CASES["picks"], CASES["fallbacks"])


def test_where_the_seat_is() -> None:
    for case in CASES["seat_cases"]:
        place = seat_place(case["seat"], CASES["persons"], CASES["locations"], case["moves"])
        assert place == case["place"], case["name"]


def test_the_banner_marks_a_scene_change_only() -> None:
    # The operator, 2026-11-23: "The location banner marks a scene change in the VTT only".
    assert scene_changed(None, {"id": "s1"})
    assert not scene_changed("s1", {"id": "s1"})
    assert scene_changed("s1", {"id": "s2"})
    assert not scene_changed("s1", None)


@pytest.mark.parametrize("case", CASES["scene_cases"], ids=lambda case: case["name"])
def test_scene_moves(case: dict[str, Any]) -> None:
    # The operator, 2026-11-23: "the DM correctly moves people on the map, triggering their presence updates".
    questions = scene_questions(case["text"], CASES["scene_people"], case["on_scene"], case["seat"])
    assert list(questions) == case["questions"]
    assert scene_changes(case["answers"], questions) == case["changes"]


HESK = {"id": "p-hesk", "name": "Old Hesk", "aliases": []}
TAM = {"id": "p-tam", "name": "Tam Quickfoot", "aliases": []}


def test_a_departure_the_lines_state_is_read_without_a_model() -> None:
    # The live run's GM line (2026-11-24): the decision model said "still here" at 0.97; his token stayed.
    line = (
        "Old Hesk pockets his coin and poles the ferry back across the river into the rain, leaving the party alone "
        "on the mill steps."
    )
    assert departures(line, [HESK, TAM], ["p-hesk", "p-tam"], None) == ["p-hesk"]


def test_a_pronoun_right_after_the_name_counts() -> None:
    line = "Old Hesk spits into the water. He walks off toward the trees without a word."
    assert departures(line, [HESK], ["p-hesk"], None) == ["p-hesk"]


def test_staying_or_refusing_is_no_departure() -> None:
    assert departures("Old Hesk refuses to leave the ferry.", [HESK], ["p-hesk"], None) == []
    assert departures("Old Hesk doesn't walk away; he stays by the post.", [HESK], ["p-hesk"], None) == []


def test_only_people_on_the_scene_and_never_the_seat() -> None:
    line = "Old Hesk walks away. Tam Quickfoot walks away."
    assert departures(line, [HESK, TAM], ["p-tam"], None) == ["p-tam"]
    assert departures(line, [HESK, TAM], ["p-hesk", "p-tam"], "p-tam") == ["p-hesk"]
