# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recall by meaning (A19) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Memory import (  # type: ignore[import-not-found]
    Remembered,
    embeddings_body,
    embeddings_url,
    memory_chunks,
    memory_query,
    memory_text,
    recall,
    story_lines,
    vectors_of,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "memory-cases.json").read_text())


def _each(kind: str) -> Any:
    return pytest.mark.parametrize("case", CASES[kind], ids=[case["name"] for case in CASES[kind]])


@_each("chunk_cases")
def test_cuts_the_older_lines_into_chunks(case: dict[str, Any]) -> None:
    assert memory_chunks(case["lines"]) == case["chunks"]


@_each("query_cases")
def test_asks_about_the_last_lines(case: dict[str, Any]) -> None:
    assert memory_query(case["lines"]) == case["query"]


@_each("recall_cases")
def test_recalls_the_closest_within_the_budget(case: dict[str, Any]) -> None:
    assert recall(case["query"], [Remembered(**memory) for memory in case["remembered"]]) == case["recalled"]


@_each("text_cases")
def test_writes_the_section(case: dict[str, Any]) -> None:
    assert memory_text(case["recalled"]) == case["text"]


@_each("url_cases")
def test_finds_the_embeddings_address(case: dict[str, Any]) -> None:
    assert embeddings_url(case["base_url"]) == case["url"]


@_each("body_cases")
def test_asks_for_every_input(case: dict[str, Any]) -> None:
    assert embeddings_body(case["model"], case["inputs"]) == case["body"]


@_each("vector_cases")
def test_accepts_one_vector_per_input(case: dict[str, Any]) -> None:
    assert vectors_of(case["answer"], case["count"]) == case["vectors"]


@_each("line_cases")
def test_names_each_story_line(case: dict[str, Any]) -> None:
    assert story_lines(case["turns"], case["user_name"], case["names"]) == case["lines"]
