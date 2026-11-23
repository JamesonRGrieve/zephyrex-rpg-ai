# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dice a model wrote itself, against contract/mechanics-cases.json, as lib/mechanics.ts runs them."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Mechanics import invented_rolls  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "mechanics-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_spans(case: dict[str, Any]) -> None:
    assert invented_rolls(case["text"]) == case["spans"]
