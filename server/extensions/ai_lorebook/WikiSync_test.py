# SPDX-License-Identifier: AGPL-3.0-or-later
"""A15's sync plan against contract/wiki-sync-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_lorebook.WikiSync import entity_keys, sync_plan  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "wiki-sync-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_shared_cases(case: dict[str, Any]) -> None:
    assert sync_plan(case["entries"], case["entities"]) == case["expected"]


def test_keys_compare_without_case_but_keep_the_first_spelling() -> None:
    assert entity_keys("Mira", ["MIRA", "Mira of the Gate"]) == ["Mira", "Mira of the Gate"]
