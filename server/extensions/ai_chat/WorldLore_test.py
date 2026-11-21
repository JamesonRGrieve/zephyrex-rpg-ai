# SPDX-License-Identifier: AGPL-3.0-or-later
"""World Info over the wiki, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.WorldLore import (  # type: ignore[import-not-found]
    wiki_campaign_of,
    world_lore_entries,
    world_lore_entry,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "world-lore-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["entry_cases"], ids=[case["name"] for case in CASES["entry_cases"]])
def test_an_entity_as_a_lore_entry(case: dict[str, Any]) -> None:
    assert world_lore_entry(case["entity"]) == case["entry"]


@pytest.mark.parametrize("case", CASES["campaign_cases"], ids=[case["name"] for case in CASES["campaign_cases"]])
def test_a_chats_wiki_campaign(case: dict[str, Any]) -> None:
    assert wiki_campaign_of(case["campaign_id"], case["frames"]) == case["wiki_campaign"]


def test_keeps_the_wikis_order() -> None:
    entries = world_lore_entries([case["entity"] for case in CASES["entry_cases"]])
    assert [entry["id"] for entry in entries] == ["p1", "l1", "x", "d"]
