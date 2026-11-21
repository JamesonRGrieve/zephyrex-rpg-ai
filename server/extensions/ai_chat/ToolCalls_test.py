# SPDX-License-Identifier: AGPL-3.0-or-later
"""A46's tool calls against contract/tool-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.ToolCalls import (  # type: ignore[import-not-found]
    assemble_tool_calls,
    check_tool_calls,
    tool_follow_up,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "tool-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["assemble"], ids=[case["name"] for case in CASES["assemble"]])
def test_assemble(case: dict[str, Any]) -> None:
    assert assemble_tool_calls(case["chunks"]) == case["calls"]


@pytest.mark.parametrize("case", CASES["check"], ids=[case["name"] for case in CASES["check"]])
def test_check(case: dict[str, Any]) -> None:
    assert check_tool_calls(case["calls"], case["offered"]) == case["checked"]


@pytest.mark.parametrize("case", CASES["follow_up"], ids=[case["name"] for case in CASES["follow_up"]])
def test_follow_up(case: dict[str, Any]) -> None:
    assert tool_follow_up(case["calls"], case["results"], case["refused"]) == case["messages"]
