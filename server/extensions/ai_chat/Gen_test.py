# SPDX-License-Identifier: AGPL-3.0-or-later
"""STscript's /gen and /genraw (audit gap 5) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Gen import gen_messages  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "gen-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_asks_the_model_as_gen_and_genraw_do(case: dict[str, Any]) -> None:
    assert gen_messages(case["chat"], case["instruction"], case["raw"], case["prefill"]) == case["messages"]
