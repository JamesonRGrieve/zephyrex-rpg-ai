# SPDX-License-Identifier: AGPL-3.0-or-later
"""Persona picking (audit gap 9) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PersonaPick import persona_books, persona_for  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "persona-cases.json").read_text())
PERSONAS: list[dict[str, Any]] = CASES["personas"]


def _id(persona: Any) -> str | None:
    return None if persona is None else str(persona["id"])


@pytest.mark.parametrize("case", CASES["pick_cases"], ids=[case["name"] for case in CASES["pick_cases"]])
def test_picks_the_persona_a_chat_speaks_as(case: dict[str, Any]) -> None:
    assert _id(persona_for(case["chosen"], case["characters"], PERSONAS)) == case["picked"]


def test_none_without_a_choice_a_lock_or_a_default() -> None:
    case = CASES["no_default_case"]
    personas = [{**persona, "is_default": False} for persona in PERSONAS]
    assert _id(persona_for(case["chosen"], case["characters"], personas)) == case["picked"]


@pytest.mark.parametrize("case", CASES["book_cases"], ids=[case["name"] for case in CASES["book_cases"]])
def test_a_personas_lorebook_joins_the_chats(case: dict[str, Any]) -> None:
    persona = next((one for one in PERSONAS if one["id"] == case["persona"]), None)
    assert persona_books(persona, case["books"]) == case["books_after"]
