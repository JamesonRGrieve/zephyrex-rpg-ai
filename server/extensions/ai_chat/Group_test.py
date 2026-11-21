# SPDX-License-Identifier: AGPL-3.0-or-later
"""The group stop strings against contract/group-cases.json, as group.ts runs them."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Group import group_stops  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "group-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_stops(case: dict[str, Any]) -> None:
    stops = group_stops(case["mode"], case["speaker"], case["cast"], case["person"], case.get("recent", []))
    assert stops == case["stops"]
