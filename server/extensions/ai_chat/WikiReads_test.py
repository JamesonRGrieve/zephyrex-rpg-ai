# SPDX-License-Identifier: AGPL-3.0-or-later
"""The world read once per requester's campaign, then only what changed since (Self Hosted AI, 2026-11-22)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from zephyrex.extensions.ai_chat import WikiReads  # type: ignore[import-not-found]


def test_the_world_is_read_whole_once_then_only_its_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[datetime | None] = []
    pages = [
        [
            {"id": "bar", "name": "The Barkeep", "deleted": False},
            {"id": "rest", "name": "River's Rest", "deleted": False},
        ],
        [{"id": "bar", "name": "The Barkeep", "deleted": True}],
    ]

    def world_entities(_registry: Any, _requester: str, _campaign: str, **page: Any) -> dict[str, Any]:
        asked.append(page["since"])
        return {"world_entities": pages[len(asked) - 1], "next": None}

    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, _name: world_entities)
    monkeypatch.setattr(WikiReads, "_WORLD", {})
    first = WikiReads.world_entities_page(None, "u1", "c1")
    assert [one["id"] for one in first] == ["bar", "rest"]
    again = WikiReads.world_entities_page(None, "u1", "c1")
    # The second read asks only for changes since the first, and a tombstone replaces its record.
    assert asked[0] is None and isinstance(asked[1], datetime)
    assert [(one["id"], one["deleted"]) for one in again] == [("bar", True), ("rest", False)]


def test_two_builds_in_one_turn_read_the_world_once(monkeypatch: pytest.MonkeyPatch) -> None:
    # The operator, 2026-11-22: "Context injection should be the same for every prompt in a turn".
    calls: list[Any] = []

    def world_entities(_registry: Any, _requester: str, _campaign: str, **page: Any) -> dict[str, Any]:
        calls.append(page["since"])
        barkeep = {"id": "bar", "kind": "person", "name": "The Barkeep", "deleted": False}
        return {"world_entities": [barkeep], "next": None}

    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, _name: world_entities)
    monkeypatch.setattr(WikiReads, "_WORLD", {})
    monkeypatch.setattr(WikiReads, "_TURNS", {})
    first = WikiReads.persons_for_turn(None, "u1", "chat1", "line1", "c1", ["bar"])
    again = WikiReads.persons_for_turn(None, "u1", "chat1", "line1", "c1", ["bar"])
    assert first == again and len(calls) == 1
    # A new line of the person's is a new turn: read again (only what changed since).
    WikiReads.persons_for_turn(None, "u1", "chat1", "line2", "c1", ["bar"])
    assert len(calls) == 2
    # A change rpg-ai makes to the wiki starts the turn's world over.
    WikiReads.forget_turns()
    WikiReads.persons_for_turn(None, "u1", "chat1", "line2", "c1", ["bar"])
    assert len(calls) == 3


def test_an_authored_npc_is_placed_beside_the_seat(monkeypatch: pytest.MonkeyPatch) -> None:
    # Zephyrex RPG, 2026-11-22: author_npc puts the new NPC on the current scene beside the seat's character.
    import asyncio

    placed: list[Any] = []

    async def current_scene(_requester: str, campaign_id: str) -> dict[str, Any]:
        return {"id": f"scene-of-{campaign_id}"}

    async def place_person(
        _requester: str, scene_id: str, person_id: str, near_person_id: str | None = None
    ) -> dict[str, Any]:
        placed.append((scene_id, person_id, near_person_id))
        return {"person_id": person_id, "scene_id": scene_id, "token_id": "t1"}

    abilities = {"current_scene": current_scene, "place_person": place_person}
    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, name: abilities.get(name))
    done = asyncio.run(WikiReads.place_in_scene(None, "u1", "c1", "barkeeper", "fennick"))
    assert placed == [("scene-of-c1", "barkeeper", "fennick")] and done is not None and done["token_id"] == "t1"


def test_a_turns_lore_is_searched_once(monkeypatch: pytest.MonkeyPatch) -> None:
    # The operator's hybrid retrieval, 2026-11-22: the wiki's lore_search, once a turn.
    searched: list[str] = []

    def lore_search(_registry: Any, _requester: str, _campaign: str, text: str, **_budget: Any) -> dict[str, Any]:
        searched.append(text)
        return {"passages": [{"name": "Owlbear", "text": "A beast of the deep woods."}], "methods": ["fts", "vector"]}

    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, _name: lore_search)
    monkeypatch.setattr(WikiReads, "_LORE", {})
    first = WikiReads.lore_passages(None, "u1", "chat1", "line1", "c1", "an owlbear")
    again = WikiReads.lore_passages(None, "u1", "chat1", "line1", "c1", "an owlbear, and more")
    assert first == again and searched == ["an owlbear"]
