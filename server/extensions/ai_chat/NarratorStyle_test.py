# SPDX-License-Identifier: AGPL-3.0-or-later
"""Narrator sliders, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.NarratorStyle import (  # type: ignore[import-not-found]
    may_narrate,
    model_key,
    narrator_endpoint,
    style_problem,
    style_tuning,
    traits_of,
    traits_problem,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "narrator-style-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["key_cases"], ids=[case["model"] for case in CASES["key_cases"]])
def test_the_model_key(case: dict[str, Any]) -> None:
    assert model_key(case["model"]) == case["key"]


@pytest.mark.parametrize("case", CASES["narrate_cases"], ids=[case["name"] for case in CASES["narrate_cases"]])
def test_who_may_narrate(case: dict[str, Any]) -> None:
    assert may_narrate(traits_of({"model": case["model"], "traits": case.get("traits")})) is case["may"]


@pytest.mark.parametrize("case", CASES["choice_cases"], ids=[case["name"] for case in CASES["choice_cases"]])
def test_the_chosen_endpoint(case: dict[str, Any]) -> None:
    endpoints = case.get("endpoints", CASES["endpoints"])
    assert narrator_endpoint(endpoints, case["style"], case["explicit"]) == case["chosen"]


@pytest.mark.parametrize("case", CASES["tuning_cases"], ids=[case["name"] for case in CASES["tuning_cases"]])
def test_the_tuning(case: dict[str, Any]) -> None:
    assert style_tuning(case["style"], case["rating"]) == case["tuning"]


TRAITS_CASES = CASES["traits_problem_cases"]
STYLE_CASES = CASES["style_problem_cases"]


@pytest.mark.parametrize("case", TRAITS_CASES, ids=[str(case["value"]) for case in TRAITS_CASES])
def test_an_endpoints_traits(case: dict[str, Any]) -> None:
    assert traits_problem(case["value"]) == case["problem"]


@pytest.mark.parametrize("case", STYLE_CASES, ids=[str(case["value"]) for case in STYLE_CASES])
def test_a_chats_style(case: dict[str, Any]) -> None:
    assert style_problem(case["value"]) == case["problem"]
