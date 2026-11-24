# SPDX-License-Identifier: AGPL-3.0-or-later
"""The party put on the map when play starts (Zephyrex RPG's live blocker, 2026-11-23)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions.ai_chat import WikiReads  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BLL_AI_Party import party_to_place  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create


def test_the_seat_first_then_the_cast_none_already_there() -> None:
    assert party_to_place(["brenna", "tam"], "tam", []) == ["tam", "brenna"]
    assert party_to_place(["brenna", "tam"], None, ["tam"]) == ["brenna"]
    assert party_to_place(["brenna"], "brenna", ["brenna"]) == []


def test_presence_follows_where_the_wiki_says_a_person_is() -> None:
    # The operator's test-play, 2026-11-24: Orrin, the missing merchant, was given a token with the party.
    rows = {
        "brenna": {"id": "brenna", "kind": "pc", "location_id": None},
        "delphine": {"id": "delphine", "kind": "npc", "location_id": "saltmere"},
        "orrin": {"id": "orrin", "kind": "npc", "location_id": None},
        "quentin": {"id": "quentin", "kind": "npc", "location_id": "the-deep"},
    }
    cast = ["brenna", "delphine", "orrin", "quentin"]
    assert party_to_place(cast, "brenna", [], rows, "saltmere") == ["brenna", "delphine"]
    assert party_to_place(cast, "brenna", [], rows, None) == ["brenna"]
    # A PC as the wiki holds one: kind "person" with the PC tag (live run, 2026-11-24).
    from zephyrex.extensions.ai_chat.Party import PARTY  # type: ignore[import-not-found]

    tagged = {**rows, "tam": {"id": "tam", "kind": "person", "tags": [PARTY["tag"]], "location_id": None}}
    assert party_to_place(["brenna", "tam", "orrin"], "brenna", [], tagged, None) == ["brenna", "tam"]
    # Or by the wiki's person_kind (requested of the wiki, 2026-11-24).
    kinded = {**rows, "tam": {"id": "tam", "kind": "person", "person_kind": "pc", "tags": [], "location_id": None}}
    assert party_to_place(["brenna", "tam", "orrin"], "brenna", [], kinded, None) == ["brenna", "tam"]


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def test_a_fresh_campaign_gets_its_party_on_the_scene(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Ferry"}}, headers=headers).json()["campaign"]["id"]
    people = [
        server.post(
            "/v1/person", json={"person": {"name": name, "kind": "pc", "campaign_id": world}}, headers=headers
        ).json()["person"]["id"]
        for name in ("Brenna", "Tam")
    ]
    made = {"chat": {"title": "Ferry", "character_ids": people, "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    placed: list[tuple[str, str | None]] = []

    async def scene(_registry: Any, _requester: str, _campaign: str | None) -> dict[str, Any]:
        return {"id": "s1"}

    async def nobody(_registry: Any, _requester: str, _campaign: str | None) -> list[str]:
        return []

    async def place(_registry: Any, _requester: str, _campaign: str | None, person: str, near: str | None) -> Any:
        placed.append((person, near))
        return {"token_id": f"t-{person}"}

    monkeypatch.setattr(WikiReads, "scene_now", scene)
    monkeypatch.setattr(WikiReads, "scene_people", nobody)
    monkeypatch.setattr(WikiReads, "place_in_scene", place)
    monkeypatch.setattr(
        WikiReads, "world_entities_by_id", lambda _r, _u, ids: [{"id": one, "kind": "pc"} for one in ids]
    )
    answer = server.post("/v1/ai_chat/place_party", json={"place_party": {"chat_id": chat["id"]}}, headers=headers)
    assert answer.status_code == 200, answer.text
    assert answer.json()["place_party"] == {"placed": people, "scene_id": "s1"}
    assert [one for one, _near in placed] == people
