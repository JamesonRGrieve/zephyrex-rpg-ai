# SPDX-License-Identifier: AGPL-3.0-or-later
"""Whether an action needs a roll, by the decision model, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.RollDecision import (  # type: ignore[import-not-found]
    is_attempt,
    light_outcome,
    roll_pick,
    roll_questions,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "roll-decision-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["question_cases"], ids=[case["name"] for case in CASES["question_cases"]])
def test_the_roll_questions(case: dict[str, Any]) -> None:
    questions, picks = roll_questions(case["options"], case["mode"], case["actor"], case.get("attempt", False))
    assert (questions, picks) == (case["questions"], case["picks"])


@pytest.mark.parametrize("case", CASES["pick_cases"], ids=[case["name"] for case in CASES["pick_cases"]])
def test_what_the_answers_pick(case: dict[str, Any]) -> None:
    options = CASES["options"] if case["pack"] else None
    _questions, picks = roll_questions(options, "narrative", "Kord")
    assert roll_pick(case["answers"], picks, options) == case["pick"]


@pytest.mark.parametrize("case", CASES["outcome_cases"], ids=[str(case["total"]) for case in CASES["outcome_cases"]])
def test_a_light_rolls_outcome(case: dict[str, Any]) -> None:
    assert light_outcome(case["total"]) == case["outcome"]


@pytest.mark.parametrize("case", CASES["attempt_cases"], ids=[case["line"] for case in CASES["attempt_cases"]])
def test_an_attempt(case: dict[str, Any]) -> None:
    assert is_attempt(case["line"]) is case["attempt"]


@pytest.mark.parametrize("case", CASES["pick_cases_5e"], ids=[case["name"] for case in CASES["pick_cases_5e"]])
def test_a_system_test_without_a_sheet(case: dict[str, Any]) -> None:
    _questions, picks = roll_questions(CASES["options_5e"], "narrative", "Fennick")
    assert roll_pick(case["answers"], picks, CASES["options_5e"]) == case["pick"]
