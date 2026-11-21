# SPDX-License-Identifier: AGPL-3.0-or-later
"""A24's session report against contract/report-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_campaign.SessionReport import (  # type: ignore[import-not-found]
    REPORT_MAX_LINES,
    REPORT_SYSTEM,
    report_mentions,
    report_prompt,
)
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "report-cases.json").read_text())
ORDERED, LONG = CASES["prompt"]


def test_story_lines_only_oldest_first_each_with_its_speaker() -> None:
    assert report_prompt(ORDERED["lines"]) == [
        {"role": "system", "content": REPORT_SYSTEM},
        {"role": "user", "content": ORDERED["user"]},
    ]


def test_only_the_last_lines_when_the_session_is_long() -> None:
    lines = [{"speaker": "GM", "text": f"line {at}", "channel": "story"} for at in range(LONG["lines_count"])]
    user = report_prompt(lines)[1]["content"].split("\n")
    assert user[0] == f"GM: line {LONG['first_kept']}"
    assert len(user) == REPORT_MAX_LINES


@pytest.mark.parametrize("case", CASES["mentions"], ids=[case["name"] for case in CASES["mentions"]])
def test_mentions(case: dict[str, Any]) -> None:
    assert report_mentions(case["text"], case["entities"]) == case["mentioned"]
