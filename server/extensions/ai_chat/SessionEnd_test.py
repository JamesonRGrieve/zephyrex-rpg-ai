# SPDX-License-Identifier: AGPL-3.0-or-later
"""A24: ending a session writes its report into the linked wiki campaign's log, against a real
server. The model's answer and the wiki's two abilities (world_entities, session_report) are stood
in for; everything else is this app's own: the chat, its story and table lines, its frame."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions.ai_chat import BLL_AI_Chat, BLL_AI_SessionEnd  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create

MIRA = {"id": "w-mira", "kind": "person", "name": "Mira", "aliases": [], "summary": "", "deleted": False}
TOWER = {"id": "w-tower", "kind": "location", "name": "Gull Tower", "aliases": [], "summary": "", "deleted": False}
REPORT = "Ada and Mira climbed the Gull Tower and lit the lamp."


class FakeWiki:
    def __init__(self) -> None:
        self.written: list[dict[str, Any]] = []

    def world_entities(self, model_registry: Any, requester_id: str, campaign_id: str, **page: Any) -> dict[str, Any]:
        return {"world_entities": [MIRA, TOWER], "next": None}

    def session_report(self, model_registry: Any, requester_id: str, **report: Any) -> dict[str, str]:
        self.written.append(report)
        return {"id": f"journal-{len(self.written)}"}


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


@pytest.fixture
def wiki(monkeypatch: pytest.MonkeyPatch) -> FakeWiki:
    fake = FakeWiki()
    abilities = {
        ("rpg_core", "world_entities"): fake.world_entities,
        ("rpg_core", "session_report"): fake.session_report,
    }
    monkeypatch.setattr(BLL_AI_SessionEnd, "loaded_ability", lambda registry, ext, name: abilities.get((ext, name)))
    return fake


@pytest.fixture
def prompts(monkeypatch: pytest.MonkeyPatch) -> list[list[dict[str, str]]]:
    """The model's answer, stood in for; each request's messages are kept."""
    asked: list[list[dict[str, str]]] = []

    async def ask(self: Any, context: dict[str, Any], sampler: dict[str, Any], messages: list[dict[str, str]]) -> str:
        asked.append(messages)
        return REPORT

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_ask", ask)
    return asked


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def _make(server: TestClient, user: Any, resource: str, **fields: Any) -> dict[str, Any]:
    answer = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(user))
    assert answer.status_code == 201, answer.text
    made: dict[str, Any] = answer.json()[resource]
    return made


def _session(server: TestClient, user: Any, wiki_campaign_id: str | None) -> str:
    _make(server, user, "model_endpoint", name="Local", base_url="http://127.0.0.1:9/v1", model="m", is_default=True)
    ada = _make(server, user, "character", name="Ada")
    frame = _make(server, user, "campaign_frame", name="The Kestrel", wiki_campaign_id=wiki_campaign_id)
    chat = _make(server, user, "chat", title="Night watch", character_ids=[ada["id"]], campaign_id=frame["id"])
    first = _make(
        server, user, "chat_message", chat_id=chat["id"], role="character", speaker_character_id=ada["id"],
        swipes=["Ada points at the Gull Tower."],
    )
    _make(
        server, user, "chat_message", chat_id=chat["id"], parent_id=first["id"], role="user", channel="ooc",
        swipes=["Can we wrap up soon?"],
    )
    return str(chat["id"])


def test_ending_a_session_writes_its_report_into_the_wiki_campaign(
    server: TestClient, wiki: FakeWiki, prompts: list[list[dict[str, str]]]
) -> None:
    user = create_user(server)
    chat_id = _session(server, user, "wiki-campaign-1")
    ended = server.post("/v1/session_end", json={"session_end": {"chat_id": chat_id}}, headers=_headers(user))
    assert ended.status_code == 200, ended.text  # 201 once the pin has custom_route status_code (sf c95b34f4)
    assert ended.json()["report_id"] == "journal-1" and ended.json()["mentions"] == 2
    [written] = wiki.written
    assert written["campaign_id"] == "wiki-campaign-1"
    assert written["body"] == REPORT and written["title"].startswith("Night watch: ")
    assert written["mentions"] == [
        {"target_entity_type": "person", "target_entity_id": "w-mira"},
        {"target_entity_type": "location", "target_entity_id": "w-tower"},
    ]
    # The model read the story only: the table talk never reaches a report.
    story = prompts[0][-1]["content"]
    assert "Ada: Ada points at the Gull Tower." in story and "wrap up" not in story


def test_a_session_needs_a_linked_wiki_campaign_and_the_wiki(
    server: TestClient, monkeypatch: pytest.MonkeyPatch, prompts: list[list[dict[str, str]]]
) -> None:
    user = create_user(server)
    unlinked = _session(server, user, None)
    refused = server.post("/v1/session_end", json={"session_end": {"chat_id": unlinked}}, headers=_headers(user))
    assert refused.status_code == 422, refused.text
    monkeypatch.setattr(BLL_AI_SessionEnd, "loaded_ability", lambda registry, ext, name: None)
    linked = _session(server, user, "wiki-campaign-2")
    no_wiki = server.post("/v1/session_end", json={"session_end": {"chat_id": linked}}, headers=_headers(user))
    assert no_wiki.status_code == 409, no_wiki.text
    assert prompts == []
