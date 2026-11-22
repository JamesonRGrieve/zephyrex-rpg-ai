# SPDX-License-Identifier: AGPL-3.0-or-later
"""A wiki campaign's own framing as the prompt's frame, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.CampaignFraming import frame_from_framing  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "campaign-framing-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_a_campaigns_framing_is_its_frame(case: dict[str, Any]) -> None:
    assert frame_from_framing(case["framing"]) == case["frame"]
