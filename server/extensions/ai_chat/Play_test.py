# SPDX-License-Identifier: AGPL-3.0-or-later
"""The play model's rules against contract/play-cases.json, as play.ts runs them."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Play import (  # type: ignore[import-not-found]
    ai_cast,
    played_persona,
    session_start_index,
    sessions_summary,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "play-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_sessions(case: dict[str, Any]) -> None:
    assert session_start_index(case["path"], case["sessions"]) == case["start"]
    assert sessions_summary(case["path"], case["sessions"]) == case["summary"]


@pytest.mark.parametrize("case", CASES["seat_cases"], ids=lambda case: case["name"])
def test_seat(case: dict[str, Any]) -> None:
    playing = case["playing"]
    assert ai_cast(case["party"], playing["id"] if playing else None) == case["ai_cast"]
    assert played_persona(playing, case["persona"]) == case["who"]
