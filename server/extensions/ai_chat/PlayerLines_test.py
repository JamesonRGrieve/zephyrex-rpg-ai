# SPDX-License-Identifier: AGPL-3.0-or-later
"""Structured lines, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PlayerLines import (  # type: ignore[import-not-found]
    format_player_lines,
    line_speaker,
    parse_player_lines,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "player-lines-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["parse_cases"], ids=[case["name"] for case in CASES["parse_cases"]])
def test_parsing_lines(case: dict[str, Any]) -> None:
    assert parse_player_lines(case["text"], CASES["people"]) == case["items"]


def test_formatting_what_it_parses() -> None:
    assert format_player_lines(CASES["format_case"]["items"], CASES["people"]) == CASES["format_case"]["text"]


@pytest.mark.parametrize("case", CASES["speaker_cases"], ids=[case["line"] for case in CASES["speaker_cases"]])
def test_a_lines_speaker(case: dict[str, Any]) -> None:
    assert line_speaker(case["line"], CASES["people"]) == case["speaker"]
