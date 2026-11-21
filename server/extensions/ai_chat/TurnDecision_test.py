# SPDX-License-Identifier: AGPL-3.0-or-later
"""Who speaks next, by the decision model, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.TurnDecision import (  # type: ignore[import-not-found]
    present_cast,
    turn_pick,
    turn_question,
    turn_seat,
    turn_state,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "turn-decision-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["seat_cases"], ids=[case["name"] for case in CASES["seat_cases"]])
def test_the_persons_seat(case: dict[str, Any]) -> None:
    assert turn_seat(case["chat_seat"], case["playing"]) == case["seat"]


@pytest.mark.parametrize("case", CASES["question_cases"], ids=[case["name"] for case in CASES["question_cases"]])
def test_the_decision_models_question(case: dict[str, Any]) -> None:
    question, picks = turn_question(
        case["cast"],
        case["muted"],
        case["seated"],
        case["seat"],
        case["player"],
        case.get("reachable"),
        case.get("after_person", False),
    )
    assert (question, picks) == (case["question"], case["picks"])


@pytest.mark.parametrize("case", CASES["pick_cases"], ids=[case["name"] for case in CASES["pick_cases"]])
def test_what_the_answer_picks(case: dict[str, Any]) -> None:
    assert turn_pick(case["answer"], CASES["pick_picks"]) == case["pick"]


def test_the_recent_story() -> None:
    assert turn_state(CASES["state_case"]["lines"]) == CASES["state_case"]["state"]
    for name in ("scene_state_case", "empty_scene_state_case"):
        assert turn_state(CASES[name]["lines"], CASES[name]["scene"]) == CASES[name]["state"]


@pytest.mark.parametrize("case", CASES["presence_cases"], ids=[case["name"] for case in CASES["presence_cases"]])
def test_who_is_in_the_scene(case: dict[str, Any]) -> None:
    assert present_cast(case["cast"], case["presence"]) == {"present": case["present"], "vox": case["vox"]}
