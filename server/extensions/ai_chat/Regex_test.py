# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regex scripts against the case file the client's twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Regex import apply_regex, compile_find  # type: ignore[import-not-found]

CASES: list[dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "regex-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_applies_the_shared_cases(case: dict[str, Any]) -> None:
    assert apply_regex(case["text"], case["scripts"], case["placement"], case["target"], case["depth"]) == case["result"]


def test_refuses_what_the_twins_would_read_differently() -> None:
    assert compile_find("//g") is None
    assert compile_find("/a/gg") is None
    assert compile_find("/a/u") is None
    assert compile_find("/a/gi") is not None
