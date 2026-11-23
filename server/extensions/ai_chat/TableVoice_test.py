# SPDX-License-Identifier: AGPL-3.0-or-later
"""The table GM's voice guard against contract/table-voice-cases.json, as lib/tableVoice.ts runs them."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.TableVoice import (  # type: ignore[import-not-found]
    story_voice_problem,
    table_voice_note,
    table_voice_problem,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "table-voice-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_voice(case: dict[str, Any]) -> None:
    assert table_voice_problem(case["answer"]) == case["problem"]


@pytest.mark.parametrize("case", CASES["story_cases"], ids=lambda case: case["name"])
def test_story_voice(case: dict[str, Any]) -> None:
    assert story_voice_problem(case["answer"]) == case["problem"]


def test_the_retry_names_the_wrong_voice() -> None:
    assert "Sergeant Horvec" in table_voice_note({"kind": "npc", "name": "Sergeant Horvec"})
    assert "assistant" in table_voice_note({"kind": "assistant", "name": None})
