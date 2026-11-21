# SPDX-License-Identifier: AGPL-3.0-or-later
"""SillyTavern's further samplers (audit gap 2) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Samplers import sampler_params, sampler_problem  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "sampler-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["param_cases"], ids=[case["name"] for case in CASES["param_cases"]])
def test_sends_what_the_api_takes(case: dict[str, Any]) -> None:
    assert sampler_params(case["values"], case["api"]) == case["params"]


@pytest.mark.parametrize("case", CASES["problem_cases"], ids=[case["name"] for case in CASES["problem_cases"]])
def test_refuses_what_cannot_be_kept(case: dict[str, Any]) -> None:
    assert sampler_problem(case["values"]) == case["problem"]
