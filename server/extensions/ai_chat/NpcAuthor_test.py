# SPDX-License-Identifier: AGPL-3.0-or-later
"""The figures a line addresses or approaches who aren't people yet, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.NpcAuthor import npc_figures  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "npc-author-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_figures_a_line_meets(case: dict[str, Any]) -> None:
    assert npc_figures(case["line"], CASES["people"]) == case["figures"]


def test_a_creature_the_line_brings_in_to_fight_is_a_figure() -> None:
    # Live run, 2026-11-24: authored nothing, so the fight had no foe and no target.
    line = "A bloated drowned thing heaves itself out of the millrace at me. I draw my sword and strike at it."
    found = npc_figures(line, [{"id": "brenna", "name": "Brenna Ashdown"}])
    assert [one["role"] for one in found] == ["bloated drowned thing"]
    # Not in a line that fights no one.
    assert npc_figures("A gull drops onto the post.", [{"id": "brenna", "name": "Brenna Ashdown"}]) == []
