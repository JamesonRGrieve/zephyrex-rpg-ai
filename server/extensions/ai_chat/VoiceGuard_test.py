# SPDX-License-Identifier: AGPL-3.0-or-later
"""The narrator's interludes and the free-text check, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.VoiceGuard import (  # type: ignore[import-not-found]
    narrate_segments,
    speaks_for,
    stranger_in,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "voice-guard-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["segment_cases"], ids=[case["name"] for case in CASES["segment_cases"]])
def test_a_narrations_segments(case: dict[str, Any]) -> None:
    assert narrate_segments(case["text"], case["cast"], case["seat"]) == case["segments"]


@pytest.mark.parametrize("case", CASES["speaks_cases"], ids=[case["name"] for case in CASES["speaks_cases"]])
def test_speaking_for_the_seat(case: dict[str, Any]) -> None:
    assert speaks_for(case["text"], case["refs"]) == case["hit"]


@pytest.mark.parametrize("case", CASES["stranger_cases"], ids=[case["name"] for case in CASES["stranger_cases"]])
def test_a_stranger_in_the_party(case: dict[str, Any]) -> None:
    assert stranger_in(case["text"]) == case["hit"]
