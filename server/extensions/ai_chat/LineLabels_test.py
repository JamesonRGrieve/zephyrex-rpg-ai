# SPDX-License-Identifier: AGPL-3.0-or-later
"""Each story line labelled by the decision model, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.LineLabels import (  # type: ignore[import-not-found]
    label_questions,
    message_lines,
    read_labels,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "line-labels-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["split_cases"], ids=[case["name"] for case in CASES["split_cases"]])
def test_the_lines_of_a_message(case: dict[str, Any]) -> None:
    assert message_lines(case["text"]) == case["lines"]


def test_the_questions() -> None:
    case = CASES["question_case"]
    state, questions = label_questions(case["lines"], case["previous"], CASES["people"])
    assert list(questions) == case["keys"] and state == case["state"]


@pytest.mark.parametrize("case", CASES["read_cases"], ids=[case["name"] for case in CASES["read_cases"]])
def test_the_labels(case: dict[str, Any]) -> None:
    assert read_labels(case["lines"], case["answers"], CASES["people"]) == case["labels"]
