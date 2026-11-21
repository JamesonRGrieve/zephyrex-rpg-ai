# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character's memory across chats (AP8) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Memory import Remembered  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.MemoryAcross import (  # type: ignore[import-not-found]
    across_text,
    recall_across,
    remembers_across_chats,
    with_across_chats,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "memory-across-cases.json").read_text())


def _each(kind: str) -> Any:
    return pytest.mark.parametrize("case", CASES[kind], ids=[case["name"] for case in CASES[kind]])


@_each("flag_cases")
def test_reads_the_flag(case: dict[str, Any]) -> None:
    assert remembers_across_chats(case["extensions"]) is case["on"]


@_each("with_cases")
def test_writes_the_flag(case: dict[str, Any]) -> None:
    assert with_across_chats(case["extensions"], case["on"]) == case["result"]


@_each("recall_cases")
def test_recalls_across_chats_within_one_budget(case: dict[str, Any]) -> None:
    found = recall_across(
        case["query"],
        [Remembered(**memory) for memory in case["here"]],
        [Remembered(**memory) for memory in case["elsewhere"]],
        "Ada",
    )
    assert {"here": found.here, "elsewhere": found.elsewhere} == case["recalled"]
    assert across_text(found, "Ada") == case["text"]
