# SPDX-License-Identifier: AGPL-3.0-or-later
"""A campaign's status line, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.StatusLine import status_clean, status_messages  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "status-line-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["messages_cases"], ids=[case["name"] for case in CASES["messages_cases"]])
def test_what_the_model_is_asked(case: dict[str, Any]) -> None:
    assert status_messages(case["summary"], case["lines"]) == case["messages"]


@pytest.mark.parametrize("case", CASES["clean_cases"], ids=[case["name"] for case in CASES["clean_cases"]])
def test_the_line(case: dict[str, Any]) -> None:
    assert status_clean(case["text"]) == case["line"]
