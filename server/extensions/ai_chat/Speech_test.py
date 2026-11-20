# SPDX-License-Identifier: AGPL-3.0-or-later
"""Server voices (A29) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Speech import audio_data_url, audio_type, speech_body, speech_url  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "speech-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["url_cases"], ids=[case["name"] for case in CASES["url_cases"]])
def test_finds_the_speech_address(case: dict[str, Any]) -> None:
    assert speech_url(case["base_url"]) == case["url"]


@pytest.mark.parametrize("case", CASES["body_cases"], ids=[case["name"] for case in CASES["body_cases"]])
def test_asks_for_the_line(case: dict[str, Any]) -> None:
    asked = case["speech"]
    assert speech_body(case["model"], asked["text"], asked["voice"], asked["speed"]) == case["body"]


@pytest.mark.parametrize("case", CASES["audio_type_cases"], ids=[case["name"] for case in CASES["audio_type_cases"]])
def test_accepts_only_audio(case: dict[str, Any]) -> None:
    assert audio_type(case["content_type"]) == case["audio_type"]


def test_audio_as_a_data_url() -> None:
    assert audio_data_url("audio/mpeg", b"ID3") == "data:audio/mpeg;base64,SUQz"
