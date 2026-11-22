# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canon warnings against contract/canon-cases.json, as canon.ts runs them."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Canon import (  # type: ignore[import-not-found]
    canon_notice,
    canon_questions,
    canon_state,
    canon_verdict,
    read_why,
    why_messages,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "canon-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_verdict(case: dict[str, Any]) -> None:
    assert canon_verdict(case["answers"], case["facts"], case["line"]) == case["verdict"]


@pytest.mark.parametrize("case", CASES["why_cases"], ids=lambda case: case["name"])
def test_why(case: dict[str, Any]) -> None:
    # The operator, 2026-11-22: "Canon check has no detail. Just 'may differ from the scenario'. I need WHY!"
    assert read_why(case["answer"]) == case["why"]


@pytest.mark.parametrize("case", CASES["notice_cases"], ids=lambda case: case["name"])
def test_notice(case: dict[str, Any]) -> None:
    assert canon_notice(case["verdict"], case["why"]) == case["notice"]


def test_the_summary_model_is_asked_against_the_fact_or_the_setting() -> None:
    asked = why_messages("Mags", "Welcome to the Split Antler!", "Mags: Mags is the barkeep of the Leaning Lantern.")
    assert "The canon: Mags: Mags is the barkeep of the Leaning Lantern." in asked[0]["content"]
    assert asked[1] == {"role": "user", "content": "Mags: Welcome to the Split Antler!"}
    assert CASES["why_setting"] in why_messages("Mags", "Hi.", None)[0]["content"]


def test_the_questions_offer_each_fact_once_and_none() -> None:
    facts = [
        {"title": "Osric", "text": "Dead."},
        {"title": "Osric", "text": "Again."},
        {"title": "Terra", "text": "Throneworld."},
    ]
    questions = canon_questions(facts)
    assert questions["fact"]["criteria"] == ["Osric", "Terra", CASES["none_option"]]
    assert questions["universe"]["criteria"] == CASES["universe_levels"]
    state = canon_state("Magnus", "Who is this Omnissiah?", facts)
    assert state.endswith("The line to check:\nMagnus: Who is this Omnissiah?")
