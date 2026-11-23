# SPDX-License-Identifier: AGPL-3.0-or-later
"""The map following the story, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.MapStep import (  # type: ignore[import-not-found]
    map_questions,
    movers,
    scene_changed,
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
