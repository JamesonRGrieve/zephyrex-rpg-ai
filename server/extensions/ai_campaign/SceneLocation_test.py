# SPDX-License-Identifier: AGPL-3.0-or-later
"""A31's scene location against contract/scene-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_campaign.SceneLocation import scene_location  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "scene-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_scene_location(case: dict[str, Any]) -> None:
    assert scene_location(case["lines"], CASES["locations"]) == case["location"]
