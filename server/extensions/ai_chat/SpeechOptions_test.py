# SPDX-License-Identifier: AGPL-3.0-or-later
"""How a speaker may speak and to whom, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.SpeechOptions import speech_manners  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "speech-options-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_ways_a_speaker_may_speak(case: dict[str, Any]) -> None:
    options = speech_manners(case["system"], case["speaker"], CASES["present"], CASES["known"], CASES["parents"])
    assert options == case["options"]
