# SPDX-License-Identifier: AGPL-3.0-or-later
"""A15: a lorebook kept in sync with its wiki campaign, against a real server. The wiki's
world_entities ability is stood in for (this product doesn't load the wiki yet), called as the wiki
gives it: (model_registry, requester_id, campaign_id, since, kinds, after, limit)."""

from collections.abc import Iterator
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions.ai_lorebook import BLL_AI_Lorebook  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create

MIRA = {"id": "w-mira", "kind": "person", "name": "Mira", "aliases": [], "summary": "The gatekeeper.", "deleted": False}
TOWER = {
    "id": "w-tower",
    "kind": "location",
    "name": "Gull Tower",
    "aliases": [],
    "summary": "A lighthouse.",
    "deleted": False,
}


class FakeWiki:
    """The wiki's world_entities, answering from pages set by the test, and recording each call."""

    def __init__(self) -> None:
        self.pages: list[dict[str, Any]] = []
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self,
        model_registry: Any,
        requester_id: str,
        campaign_id: str,
        since: datetime | None = None,
        kinds: list[str] | None = None,
        after: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        self.calls.append({"campaign_id": campaign_id, "since": since, "after": after, "limit": limit})
        return self.pages.pop(0)


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


@pytest.fixture
def wiki(monkeypatch: pytest.MonkeyPatch) -> FakeWiki:
    fake = FakeWiki()
    monkeypatch.setattr(
        BLL_AI_Lorebook,
        "loaded_ability",
        lambda registry, extension, name: fake if (extension, name) == ("rpg_core", "world_entities") else None,
    )
    return fake


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def _book(server: TestClient, user: Any, **fields: Any) -> dict[str, Any]:
    response = server.post("/v1/lorebook", json={"lorebook": {"name": "Saltmarsh", **fields}}, headers=_headers(user))
    assert response.status_code == 201, response.text
    book: dict[str, Any] = response.json()["lorebook"]
    return book


def _entries(server: TestClient, user: Any, book_id: str) -> list[dict[str, Any]]:
    response = server.get("/v1/lorebook_entry", params={"lorebook_id": book_id}, headers=_headers(user))
    assert response.status_code == 200, response.text
    rows: list[dict[str, Any]] = response.json()["lorebook_entries"]
    return rows


def test_a_book_follows_its_wiki_campaign(server: TestClient, wiki: FakeWiki) -> None:
    person = create_user(server)
    book = _book(server, person, wiki_campaign_id="campaign-1")
    own = server.post(
        "/v1/lorebook_entry",
        json={
            "lorebook_entry": {"lorebook_id": book["id"], "comment": "Mira", "keys": ["Mira"], "content": "My notes."}
        },
        headers=_headers(person),
    )
    assert own.status_code == 201, own.text

    # Two pages: the second named by the first's cursor, all in one sync.
    wiki.pages = [{"world_entities": [MIRA], "next": "page-2"}, {"world_entities": [TOWER], "next": None}]
    synced = server.post("/v1/lorebook/sync", json={"sync": {"lorebook_id": book["id"]}}, headers=_headers(person))
    assert synced.status_code == 200, synced.text
    assert synced.json() == {"created": 2, "updated": 0, "removed": 0}
    assert [call["after"] for call in wiki.calls] == [None, "page-2"]
    assert wiki.calls[0]["since"] is None and wiki.calls[0]["campaign_id"] == "campaign-1"
    linked = {row["wiki_entity_id"]: row for row in _entries(server, person, book["id"]) if row["wiki_entity_id"]}
    assert linked["w-mira"]["content"] == "The gatekeeper."
    assert linked["w-tower"]["keys"] == ["Gull Tower"]

    # The next sync asks only for what changed since this one began, and follows it.
    wiki.calls.clear()
    wiki.pages = [
        {
            "world_entities": [{**MIRA, "summary": "The gatekeeper, now a traitor."}, {**TOWER, "deleted": True}],
            "next": None,
        }
    ]
    again = server.post("/v1/lorebook/sync", json={"sync": {"lorebook_id": book["id"]}}, headers=_headers(person))
    assert again.json() == {"created": 0, "updated": 1, "removed": 1}
    assert wiki.calls[0]["since"] is not None
    rows = _entries(server, person, book["id"])
    assert {row["wiki_entity_id"] for row in rows} == {"w-mira", None}
    # The person's own entry, though it shares a name, is never touched.
    assert [row["content"] for row in rows if row["wiki_entity_id"] is None] == ["My notes."]


def test_refusals(server: TestClient, wiki: FakeWiki, monkeypatch: pytest.MonkeyPatch) -> None:
    person = create_user(server)
    unlinked = _book(server, person)
    assert (
        server.post(
            "/v1/lorebook/sync", json={"sync": {"lorebook_id": unlinked["id"]}}, headers=_headers(person)
        ).status_code
        == 422
    )
    # Someone else's book reads as missing.
    stranger = create_user(server)
    linked = _book(server, person, wiki_campaign_id="campaign-1")
    assert (
        server.post(
            "/v1/lorebook/sync", json={"sync": {"lorebook_id": linked["id"]}}, headers=_headers(stranger)
        ).status_code
        == 404
    )
    # Without the wiki in this install.
    monkeypatch.setattr(BLL_AI_Lorebook, "loaded_ability", lambda *args: None)
    assert (
        server.post(
            "/v1/lorebook/sync", json={"sync": {"lorebook_id": linked["id"]}}, headers=_headers(person)
        ).status_code
        == 409
    )
