# SPDX-License-Identifier: AGPL-3.0-or-later
"""A15's lore gate against contract/lore-gate-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_lorebook.LoreGate import apply_lore_pick, lore_gate_needed  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "lore-gate-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["needed"], ids=[case["name"] for case in CASES["needed"]])
def test_needed(case: dict[str, Any]) -> None:
    assert lore_gate_needed(case["tokens"], case["budget"]) is case["needed"]


@pytest.mark.parametrize("case", CASES["apply"], ids=[case["name"] for case in CASES["apply"]])
def test_apply(case: dict[str, Any]) -> None:
    assert apply_lore_pick(case["entries"], case["picked"], case["budget"]) == case["kept"]
