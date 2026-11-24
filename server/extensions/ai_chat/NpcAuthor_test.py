# SPDX-License-Identifier: AGPL-3.0-or-later
"""The figures a line addresses or approaches who aren't people yet, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.NpcAuthor import attackers, npc_figures  # type: ignore[import-not-found]

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


def test_a_creature_the_gm_brings_in_mid_sentence_is_a_figure() -> None:
    # Live run, 2026-11-24 (prod): the GM's own fight line authored nothing, so only Tam was in the fight.
    line = (
        "As the ferry bumps the mill steps, a bloated drowned thing heaves itself out of the water at Tam. "
        "Roll initiative!"
    )
    found = npc_figures(line, [{"id": "tam", "name": "Tam Quickfoot"}])
    assert [one["role"] for one in found] == ["bloated drowned thing"]
    assert npc_figures("The rain eases, a cold wind comes off the river.", [{"id": "tam", "name": "Tam"}]) == []


def test_whoever_the_line_brings_in_to_attack_is_an_attacker() -> None:
    # build56: the drowned thing, asked, came out friendly, and the seat had no one to strike.
    people = [
        {"id": "thing", "name": "The Bloated Drowned Thing"},
        {"id": "hesk", "name": "Old Hesk"},
        {"id": "tam", "name": "Tam Quickfoot"},
    ]
    line = "As the ferry bumps the mill steps, a bloated drowned thing heaves itself out of the water at Tam."
    assert attackers(line + " Roll initiative!", people) == ["thing"]
    # The seat's line as saved, its speaker's name first (build60's live run: the creature came out friendly).
    saved = "Brenna Ashdown A bloated drowned thing heaves itself out of the millrace at me. I strike at it."
    assert attackers(saved, [*people, {"id": "bren", "name": "Brenna Ashdown"}]) == ["thing"]
    # A line that fights no one makes no attacker.
    assert attackers("A bloated drowned thing drifts past the ferry, face down.", people) == []
