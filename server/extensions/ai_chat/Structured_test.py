# SPDX-License-Identifier: AGPL-3.0-or-later
"""Schema-constrained turns, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Structured import (  # type: ignore[import-not-found]
    ItemStream,
    fresh_items,
    partial_items,
    run_text,
    structured_runs,
    turn_schema,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "structured-cases.json").read_text())


def test_the_turn_schema() -> None:
    assert turn_schema() == CASES["schema"]


@pytest.mark.parametrize("case", CASES["partial_cases"], ids=[case["name"] for case in CASES["partial_cases"]])
def test_partial_items(case: dict[str, Any]) -> None:
    assert partial_items(case["source"]) == case["items"]


def test_the_stream() -> None:
    stream = ItemStream(CASES["people"], CASES["seat"])
    assert [stream.feed(chunk) for chunk in CASES["stream_case"]["chunks"]] == CASES["stream_case"]["events"]
    assert (stream.cut, stream.mode) == (CASES["stream_case"]["cut"], CASES["stream_case"]["mode"])


def test_prose_falls_back() -> None:
    stream = ItemStream(CASES["people"], CASES["seat"])
    assert [event for chunk in CASES["prose_case"]["chunks"] for event in stream.feed(chunk)] == []
    assert stream.mode == CASES["prose_case"]["mode"]


def test_the_runs() -> None:
    result = structured_runs(CASES["partial_cases"][1]["items"], CASES["people"], CASES["seat"])
    assert result == {"runs": CASES["runs_case"]["runs"], "cut": CASES["runs_case"]["cut"]}
    assert [run_text(run, CASES["people"]) for run in result["runs"]] == CASES["text_cases"]


def test_a_retold_item_is_dropped() -> None:
    whole = CASES["partial_cases"][1]["items"]
    assert fresh_items(whole, CASES["fresh_case"]["earlier"]) == [whole[index] for index in CASES["fresh_case"]["kept"]]


@pytest.mark.parametrize("case", CASES["guard_cases"], ids=[case["name"] for case in CASES["guard_cases"]])
def test_echoes_and_the_seat_are_kept_out(case: dict[str, Any]) -> None:
    result = structured_runs(case["items"], CASES["people"], CASES["seat"], case["latest"])
    assert result == {"runs": case["runs"], "cut": case["cut"]}
