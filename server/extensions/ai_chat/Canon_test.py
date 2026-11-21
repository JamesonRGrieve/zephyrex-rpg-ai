# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canon warnings against contract/canon-cases.json, as canon.ts runs them."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Canon import canon_questions, canon_state, canon_verdict  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "canon-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_verdict(case: dict[str, Any]) -> None:
    assert canon_verdict(case["answers"], case["facts"]) == case["verdict"]


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
