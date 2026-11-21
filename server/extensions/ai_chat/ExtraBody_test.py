# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extra request fields per endpoint, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.ExtraBody import extra_body_problem, with_extra_body  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "extra-body-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["problem_cases"], ids=[case["name"] for case in CASES["problem_cases"]])
def test_says_why_extra_fields_cant_be_kept(case: dict[str, Any]) -> None:
    assert extra_body_problem(case["value"]) == case["problem"]


@pytest.mark.parametrize("case", CASES["merge_cases"], ids=[case["name"] for case in CASES["merge_cases"]])
def test_merges_extra_fields_never_over_the_conversation(case: dict[str, Any]) -> None:
    assert with_extra_body(case["body"], case["extra"]) == case["merged"]
