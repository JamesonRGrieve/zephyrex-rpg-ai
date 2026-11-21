# SPDX-License-Identifier: AGPL-3.0-or-later
"""AP7's spotlight against contract/spotlight-cases.json, the cases the lite twin also runs."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_campaign.Spotlight import quiet_players, spotlight_note  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "spotlight-cases.json").read_text())


def _lines(case: dict[str, Any]) -> list[dict[str, str]]:
    if "lines" in case:
        return list(case["lines"])
    runs = case["lines_repeat"]
    return [
        {"speaker": run["speaker"], "channel": run["channel"]}
        for run in (runs["first"], runs["then"])
        for _ in range(run["count"])
    ]


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_spotlight(case: dict[str, Any]) -> None:
    quiet = quiet_players(case["pcs"], _lines(case))
    assert quiet == case["quiet"]
    assert spotlight_note(quiet) == case["note"]
