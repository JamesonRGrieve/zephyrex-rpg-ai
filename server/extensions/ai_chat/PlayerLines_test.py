# SPDX-License-Identifier: AGPL-3.0-or-later
"""Structured lines, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PlayerLines import (  # type: ignore[import-not-found]
    drop_stale_location,
    format_player_lines,
    line_speaker,
    location_line,
    parse_player_lines,
    strip_markup,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "player-lines-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["parse_cases"], ids=[case["name"] for case in CASES["parse_cases"]])
def test_parsing_lines(case: dict[str, Any]) -> None:
    assert parse_player_lines(case["text"], CASES["people"]) == case["items"]


def test_formatting_what_it_parses() -> None:
    assert format_player_lines(CASES["format_case"]["items"], CASES["people"]) == CASES["format_case"]["text"]
    targets = CASES["target_format_case"]
    assert format_player_lines(targets["items"], CASES["people"]) == targets["text"]


@pytest.mark.parametrize("case", CASES["speaker_cases"], ids=[case["line"] for case in CASES["speaker_cases"]])
def test_a_lines_speaker(case: dict[str, Any]) -> None:
    assert line_speaker(case["line"], CASES["people"]) == case["speaker"]


@pytest.mark.parametrize("case", CASES["markup_cases"], ids=[case["name"] for case in CASES["markup_cases"]])
def test_markup_stripped(case: dict[str, Any]) -> None:
    assert strip_markup(case["text"]) == case["plain"]


LOCATIONS = CASES["location_cases"]


@pytest.mark.parametrize("case", LOCATIONS["cases"], ids=[case["name"] for case in LOCATIONS["cases"]])
def test_a_location_banner(case: dict[str, Any]) -> None:
    assert location_line(case["text"], LOCATIONS["locations"]) == case["line"]


@pytest.mark.parametrize(
    "case", CASES["stale_location_cases"], ids=[case["name"] for case in CASES["stale_location_cases"]]
)
def test_a_stale_location_line_goes_at_save(case: dict[str, Any]) -> None:
    assert drop_stale_location(case["text"], case["current"]) == case["kept"]


def test_a_reply_keeps_no_location_banner() -> None:
    # The operator, 2026-11-24: "It also threw a random location banner in?" The banner is the server's, on a
    # scene change only.
    from zephyrex.extensions.ai_chat.PlayerLines import without_banners

    assert without_banners("[location: Saltmere Quay]\nRain on the quay.") == "Rain on the quay."
    assert without_banners("Rain.\n[Location: Saltmere | the docks]\nMore rain.") == "Rain.\nMore rain."
    assert without_banners("She says [location] twice.") == "She says [location] twice."


def test_a_reply_keeps_no_code_fence() -> None:
    # The operator's test-play, 2026-11-24: a message of nothing but ``` was saved as a line.
    from zephyrex.extensions.ai_chat.PlayerLines import story_reply

    assert story_reply("```") == ""
    assert story_reply("```json\nRain.\n```") == "Rain."
    assert story_reply("[location: Quay]\nShe says `hush`.") == "She says `hush`."
