# SPDX-License-Identifier: AGPL-3.0-or-later
"""Party members know each other, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Party import (  # type: ignore[import-not-found]
    one_line,
    party_briefing,
    party_of,
    party_text,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "party-cases.json").read_text())
FIRST = CASES["party_cases"][0]


@pytest.mark.parametrize("case", CASES["party_cases"], ids=[case["name"] for case in CASES["party_cases"]])
def test_the_party(case: dict[str, Any]) -> None:
    assert party_of(case.get("entities", CASES["entities"]), case["cast"], case["seated"]) == case["party"]


def test_the_shared_briefing() -> None:
    assert party_briefing(CASES["entities"]) == CASES["briefing"]


@pytest.mark.parametrize("case", CASES["text_cases"], ids=[case["name"] for case in CASES["text_cases"]])
def test_the_party_block(case: dict[str, Any]) -> None:
    party = party_of(CASES["entities"], FIRST["cast"], FIRST["seated"])
    assert party_text(party, case["speaker"], CASES["entities"], CASES["briefing"]) == case["text"]


@pytest.mark.parametrize("case", CASES["line_cases"], ids=[str(case["summary"]) for case in CASES["line_cases"]])
def test_one_line(case: dict[str, Any]) -> None:
    assert one_line(case["summary"]) == case["line"]
