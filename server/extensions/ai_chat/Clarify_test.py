# SPDX-License-Identifier: AGPL-3.0-or-later
"""The GM's question tool, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Clarify import (  # type: ignore[import-not-found]
    clarify_need,
    clarify_questions,
    should_ask,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "clarify-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["need_cases"], ids=[case["name"] for case in CASES["need_cases"]])
def test_whether_a_question_may_be_needed(case: dict[str, Any]) -> None:
    assert clarify_need(case["items"], case["seat"], case["candidates"]) == case["need"]


def test_the_questions() -> None:
    case = CASES["questions_case"]
    assert clarify_questions(case["action"], case["actor"], case["candidates"]) == case["questions"]


@pytest.mark.parametrize("case", CASES["ask_cases"], ids=[str(case["answer"]) for case in CASES["ask_cases"]])
def test_when_to_ask(case: dict[str, Any]) -> None:
    assert should_ask(case["answer"]) is case["ask"]
