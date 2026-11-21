# SPDX-License-Identifier: AGPL-3.0-or-later
"""A campaign's opening, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_campaign.Opening import opening_for  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "opening-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_opening(case: dict[str, Any]) -> None:
    opened = opening_for(case["seated"], case["situation"], case["entities"], case["scene"], case["default"])
    assert opened == {"text": case["text"], "location_id": case["location_id"], "starts": case["starts"]}
