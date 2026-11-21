# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character from a wiki person, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PersonVoice import person_character  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "person-voice-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_a_person_as_a_character(case: dict[str, Any]) -> None:
    assert person_character(case["person"]) == case["character"]
