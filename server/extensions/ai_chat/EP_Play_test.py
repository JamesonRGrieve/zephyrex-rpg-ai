# SPDX-License-Identifier: AGPL-3.0-or-later
"""The play model over the API (docs/DESIGN.md, The play model): a campaign's sessions and seat.

A reply reads the current session's lines and the earlier sessions by their summaries; the
character the person plays is who they are, and leaves the cast the AI plays.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.testing.factories import create_user

from rpg_ai_app import create


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def _create(server: TestClient, user: Any, resource: str, **fields: Any) -> dict[str, Any]:
    response = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(user))
    assert response.status_code == 201, response.text
    return response.json()[resource]


def _line(server: TestClient, user: Any, chat_id: str, parent: str | None, **fields: Any) -> str:
    return _create(server, user, "chat_message", chat_id=chat_id, parent_id=parent, **fields)["id"]


class TestCampaignPlay:
    def test_sessions_compact_and_the_seat_is_the_person(self, server: TestClient) -> None:
        user = create_user(server)
        gus = _create(server, user, "character", name="Gus", description="{{char}} is an ex-Navy rating.")
        az = _create(server, user, "character", name="A.Z.", description="A sanctioned psyker.")
        _create(
            server,
            user,
            "model_endpoint",
            name="Local",
            base_url="http://127.0.0.1:9/v1",
            model="tiny",
            is_default=True,
        )
        chat = _create(
            server, user, "chat", title="Solenne", character_ids=[gus["id"], az["id"]], mode="group", seat="player"
        )
        opening = _line(server, user, chat["id"], None, role="narrator", swipes=["The ship leaves the warp."])
        made = server.post(
            "/v1/chat_session",
            json={"chat_session": {"chat_id": chat["id"], "number": 1, "start_message_id": opening}},
            headers=_headers(user),
        )
        assert made.status_code == 201, made.text
        first = made.json()["chat_session"]
        old = _line(server, user, chat["id"], opening, role="user", swipes=["An old line from session one."])
        reply = _line(server, user, chat["id"], old, role="character", speaker_character_id=gus["id"], swipes=["Aye."])
        ended = server.put(
            f"/v1/chat_session/{first['id']}",
            json={"chat_session": {"summary": "They arrived at Solenne.", "ended_at": "2026-11-21T06:00:00Z"}},
            headers={**_headers(user), "If-Match": made.headers["ETag"]},
        )
        assert ended.status_code == 200, ended.text
        marker = _line(server, user, chat["id"], reply, role="system", channel="system", swipes=["Session 2"])
        _create(server, user, "chat_session", chat_id=chat["id"], number=2, start_message_id=marker)
        now = _line(server, user, chat["id"], marker, role="user", swipes=["A new line in session two."])
        _create(server, user, "campaign_play", chat_id=chat["id"], playing_id=az["id"])

        asked = {"generate": {"chat_id": chat["id"], "leaf_id": now, "speaker_id": gus["id"]}}
        prompt = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user))
        assert prompt.status_code == 200, prompt.text
        text = "\n".join(message["content"] for message in prompt.json()["prompt"]["messages"])
        assert "Session 1, in brief:\nThey arrived at Solenne." in text
        assert "A new line in session two." in text
        assert "An old line from session one." not in text
        # The person is A.Z., the character they play; the AI plays Gus.
        assert "A sanctioned psyker." in text

    def test_only_your_own_chat_has_sessions_and_a_play_state(self, server: TestClient) -> None:
        owner, stranger = create_user(server), create_user(server)
        ada = _create(server, owner, "character", name="Ada")
        chat = _create(server, owner, "chat", title="Mine", character_ids=[ada["id"]])
        opening = _line(server, owner, chat["id"], None, role="narrator", swipes=["Hello."])
        for resource, fields in (
            ("chat_session", {"chat_id": chat["id"], "number": 1, "start_message_id": opening}),
            ("campaign_play", {"chat_id": chat["id"]}),
        ):
            refused = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(stranger))
            assert refused.status_code == 422, refused.text
        _create(server, owner, "campaign_play", chat_id=chat["id"])
        again = server.post(
            "/v1/campaign_play", json={"campaign_play": {"chat_id": chat["id"]}}, headers=_headers(owner)
        )
        assert again.status_code == 409, again.text
