# SPDX-License-Identifier: AGPL-3.0-or-later
"""Who is present (BLL_AI_Chat.present_people): the campaign's people, never a setting's canon."""

from __future__ import annotations

from types import SimpleNamespace

from zephyrex.extensions.ai_chat.BLL_AI_Chat import present_people  # type: ignore[import-not-found]


def test_a_settings_canon_creature_is_never_present() -> None:
    # The operator, 2026-11-22: the GM's question offered a "cloud giant" in a tavern.
    world = [
        {"id": "inn", "kind": "location", "name": "The River's Rest", "deleted": False},
        {"id": "bar", "kind": "person", "name": "The Barkeep", "deleted": False, "location_id": "inn"},
        {"id": "pri", "kind": "person", "name": "The Priest", "deleted": False, "location_id": "inn"},
        {"id": "giant", "kind": "person", "name": "Cloud Giant", "deleted": False, "canon": True},
    ]
    turns = [{"role": "user", "speaker_character_id": None, "content": "At The River's Rest, a cloud giant story."}]
    present = present_people(SimpleNamespace(vox_ids=[]), "fen", world, turns)
    assert "giant" not in [one["id"] for one in present]
    assert {one["id"] for one in present} == {"bar", "pri"}


def test_a_freeform_character_is_known_by_its_tag() -> None:
    # The operator, 2026-11-22: a "Freeform Character" developed during play; the wiki tags it "Freeform".
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import is_freeform

    assert is_freeform({"id": "dex", "tags": ["Freeform", "Rogue Trader"]})
    assert is_freeform({"id": "dex", "tags": ["freeform"]})
    assert is_freeform({"id": "dex", "summary": "A freeform character: who they are grows in play."})
    assert not is_freeform({"id": "ada", "tags": ["Engineer"], "summary": "Fixes engines."})
    assert not is_freeform(None)
