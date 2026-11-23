# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character card's wiki person (Zephyrex RPG's live bug, 2026-11-23): imported once, then reused."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions import AbstractExtensionProvider
from zephyrex.extensions.ai_chat import WikiReads  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BLL_AI_CardPerson import LINK, card_fields, card_link  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def test_the_link_and_the_fields_the_wiki_reads() -> None:
    assert card_link({LINK: {"person_id": "p1", "campaign_id": "c1"}}) == {"person_id": "p1", "campaign_id": "c1"}
    assert card_link({LINK: {"person_id": "p1"}}) is None and card_link(None) is None

    from types import SimpleNamespace

    card = SimpleNamespace(
        name="Mags",
        description="A barkeep.",
        personality="",
        first_message="What'll it be?",
        extensions={LINK: {"person_id": "p1", "campaign_id": "c1"}, "depth_prompt": {"prompt": "x"}},
    )
    fields = card_fields(card)
    assert fields == {
        "name": "Mags",
        "description": "A barkeep.",
        "first_message": "What'll it be?",
        "extensions": {"depth_prompt": {"prompt": "x"}},
    }


def test_a_card_is_imported_once_then_its_person_reused(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    user = create_user(server)  # type: ignore[no-untyped-call]
    made = server.post(
        "/v1/character", json={"character": {"name": "Mags", "description": "A barkeep."}}, headers=_headers(user)
    )
    assert made.status_code == 201, made.text
    card = made.json()["character"]
    imported: list[dict[str, Any]] = []

    def import_card_person(_registry: Any, _requester: str, fields: dict[str, Any]) -> dict[str, str]:
        imported.append(fields)
        return {"person_id": "p-mags", "campaign_id": "c-characters"}

    abilities = {"import_card_person": import_card_person}
    monkeypatch.setattr(AbstractExtensionProvider, "loaded_ability", lambda _registry, _ext, name: abilities.get(name))
    monkeypatch.setattr(WikiReads, "world_entities_by_id", lambda _r, _u, ids: [{"id": ids[0]}])
    asked = {"card_person": {"card_id": card["id"]}}
    first = server.post("/v1/ai_chat/card_person", json=asked, headers=_headers(user))
    assert first.status_code == 200, first.text
    assert first.json()["card_person"] == {"person_id": "p-mags", "campaign_id": "c-characters", "imported": True}
    assert imported[0]["name"] == "Mags" and imported[0]["description"] == "A barkeep."
    again = server.post("/v1/ai_chat/card_person", json=asked, headers=_headers(user)).json()["card_person"]
    assert again == {"person_id": "p-mags", "campaign_id": "c-characters", "imported": False}
    assert len(imported) == 1
    other = create_user(server)  # type: ignore[no-untyped-call]
    refused = server.post("/v1/ai_chat/card_person", json=asked, headers=_headers(other))
    assert refused.status_code == 404, refused.text
