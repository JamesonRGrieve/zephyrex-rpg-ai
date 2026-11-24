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


def test_a_long_message_is_labelled_in_small_calls_that_merge() -> None:
    # Self Hosted AI, 2026-11-24: one call of ~48 questions outran the 970's deadline.
    from zephyrex.extensions.ai_chat.LineLabels import label_chunks, label_questions

    lines = [f"Line number {n}." for n in range(7)]
    people = [{"id": "hesk", "name": "Old Hesk"}]
    chunks = label_chunks(lines, ["Before one.", "Before two."], people, 3)
    assert [len(questions) // 4 for _state, questions in chunks] == [3, 3, 1]
    merged = {key for _state, questions in chunks for key in questions}
    assert merged == set(label_questions(lines, [], people)[1])
    # The second chunk reads the two lines before it.
    assert chunks[1][0].splitlines()[:2] == ["Before: Line number 1.", "Before: Line number 2."]
