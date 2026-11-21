# SPDX-License-Identifier: AGPL-3.0-or-later
"""STscript's /inject (audit gap 5) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Injections import injections_problem  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "injection-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["problem_cases"], ids=[case["name"] for case in CASES["problem_cases"]])
def test_says_why_injections_cant_be_kept(case: dict[str, Any]) -> None:
    assert injections_problem(case["value"]) == case["problem"]
