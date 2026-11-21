# SPDX-License-Identifier: AGPL-3.0-or-later
"""A chat's cast and seat from the wiki, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.WorldCast import (  # type: ignore[import-not-found]
    seat_person,
    world_cast,
    world_known_to,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "world-cast-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cast_cases"], ids=[case["name"] for case in CASES["cast_cases"]])
def test_a_chats_cast_from_the_wiki(case: dict[str, Any]) -> None:
    assert world_cast(CASES["entities"], case["character_ids"]) == case["cast"]


@pytest.mark.parametrize("case", CASES["seat_cases"], ids=[case["name"] for case in CASES["seat_cases"]])
def test_the_seated_person(case: dict[str, Any]) -> None:
    assert seat_person(CASES["entities"], case["seated"]) == case["persona"]


@pytest.mark.parametrize("case", CASES["known_cases"], ids=[case["name"] for case in CASES["known_cases"]])
def test_what_one_voice_may_know(case: dict[str, Any]) -> None:
    assert world_known_to(case["entities"], case["viewer"], case["gm"]) == case["known"]
