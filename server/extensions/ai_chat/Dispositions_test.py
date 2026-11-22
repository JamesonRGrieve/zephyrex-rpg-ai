# SPDX-License-Identifier: AGPL-3.0-or-later
"""Grounded state, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Dispositions import (  # type: ignore[import-not-found]
    apply_stances,
    parse_status,
    scene_state,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "disposition-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["parse_cases"], ids=[case["name"] for case in CASES["parse_cases"]])
def test_the_summary_models_answer(case: dict[str, Any]) -> None:
    assert parse_status(case["text"]) == case["parsed"]


@pytest.mark.parametrize("case", CASES["apply_cases"], ids=[case["name"] for case in CASES["apply_cases"]])
def test_stances_applied(case: dict[str, Any]) -> None:
    assert apply_stances(case["current"], case["updates"], CASES["people"]) == case["after"]


@pytest.mark.parametrize("case", CASES["scene_cases"], ids=[case["name"] for case in CASES["scene_cases"]])
def test_the_scene_state(case: dict[str, Any]) -> None:
    assert scene_state(case["here"], case["dispositions"], case["viewer"]) == case["text"]
