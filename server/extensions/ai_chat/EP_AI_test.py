# SPDX-License-Identifier: AGPL-3.0-or-later
"""The ai_character and ai_chat extensions against a real server, the same cases as the lite
edition's (client/src/app/api/v1/routes.test.ts, client/src/lib/generate.test.ts): defaults and
stale saves, references held to the requester's own records, messages listed by chat, the shown
swipe kept inside the swipes, a deleted message taking its branch with it, one default persona, a
write-only API key, one person's records invisible to another, and a reply streamed from a real
OpenAI-compatible endpoint that never sees the table talk."""

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.testing.factories import create_user

from rpg_ai_app import create

RECEIVED: list[dict[str, Any]] = []


class FakeModel(BaseHTTPRequestHandler):
    """A real HTTP server answering as an OpenAI-compatible endpoint: a two-piece streamed reply."""

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        RECEIVED.append({"path": self.path, "authorization": self.headers.get("Authorization"), "body": json.loads(self.rfile.read(length))})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for piece in ("“Mind ", "the coolant.”"):
            self.wfile.write(f"data: {json.dumps({'choices': [{'delta': {'content': piece}}]})}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - the stdlib's name
        del format, args


@pytest.fixture(scope="module")
def model_url() -> Iterator[str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeModel)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/v1"
    httpd.shutdown()


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


@pytest.fixture(scope="module")
def person(server: TestClient) -> Any:
    return create_user(server)


@pytest.fixture(scope="module")
def other(server: TestClient) -> Any:
    return create_user(server)


def _headers(user: Any, **extra: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}", **extra}


def _create(server: TestClient, user: Any, resource: str, **fields: Any) -> Any:
    response = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(user))
    assert response.status_code == 201, response.text
    return response


def _put(server: TestClient, user: Any, resource: str, record_id: str, etag: str, **fields: Any) -> Any:
    return server.put(f"/v1/{resource}/{record_id}", json={resource: fields}, headers=_headers(user, **{"If-Match": etag}))


class TestCharacters:
    def test_defaults_and_stale_saves(self, server: TestClient, person: Any) -> None:
        created = _create(server, person, "character", name="Ada")
        character = created.json()["character"]
        assert {key: character[key] for key in ("description", "first_message", "alternate_greetings", "tags", "avatar", "favourite", "extensions")} == {
            "description": "",
            "first_message": "",
            "alternate_greetings": [],
            "tags": [],
            "avatar": None,
            "favourite": False,
            "extensions": {},
        }
        url = f"/v1/character/{character['id']}"
        assert server.put(url, json={"character": {"name": "x"}}, headers=_headers(person)).status_code == 428
        assert _put(server, person, "character", character["id"], created.headers["ETag"], favourite=True).status_code == 200
        assert _put(server, person, "character", character["id"], created.headers["ETag"], name="lost").status_code == 412

    @pytest.mark.parametrize(
        "fields",
        [
            {"name": "  "},
            {"name": "Ada", "avatar": "https://example.com/a.png"},
            {"name": "Ada", "tags": [""]},
            {"name": "Ada", "alternate_greetings": ["x"] * 33},
        ],
    )
    def test_refuses_what_the_contract_forbids(self, server: TestClient, person: Any, fields: dict[str, Any]) -> None:
        assert server.post("/v1/character", json={"character": fields}, headers=_headers(person)).status_code == 422

    def test_another_person_cannot_see_a_character(self, server: TestClient, person: Any, other: Any) -> None:
        character = _create(server, person, "character", name="Private").json()["character"]
        assert server.get(f"/v1/character/{character['id']}", headers=_headers(other)).status_code in (403, 404)


class TestChats:
    def test_refuses_a_character_that_is_not_yours(self, server: TestClient, person: Any, other: Any) -> None:
        theirs = _create(server, other, "character", name="Theirs").json()["character"]
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [theirs["id"]]}}, headers=_headers(person))
        assert refused.status_code == 422, refused.text

    def test_messages_branch_list_by_chat_and_delete_whole(self, server: TestClient, person: Any) -> None:
        ada = _create(server, person, "character", name="Ada").json()["character"]
        chat = _create(server, person, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]

        def say(parent: str | None, text: str, **extra: Any) -> Any:
            return _create(server, person, "chat_message", chat_id=chat["id"], parent_id=parent, role="user", swipes=[text], **extra)

        root = say(None, "Hello", role="character", speaker_character_id=ada["id"]).json()["chat_message"]
        left = say(root["id"], "Left")
        say(left.json()["chat_message"]["id"], "Left again")
        right = say(root["id"], "Right", channel="ooc").json()["chat_message"]

        listed = server.get(f"/v1/chat_message?chat_id={chat['id']}", headers=_headers(person)).json()["chat_messages"]
        assert len(listed) == 4
        assert next(message for message in listed if message["id"] == right["id"])["channel"] == "ooc"

        deleted = server.delete(f"/v1/chat_message/{left.json()['chat_message']['id']}", headers=_headers(person, **{"If-Match": left.headers["ETag"]}))
        assert deleted.status_code == 204, deleted.text
        remaining = server.get(f"/v1/chat_message?chat_id={chat['id']}", headers=_headers(person)).json()["chat_messages"]
        assert sorted(message["id"] for message in remaining) == sorted([root["id"], right["id"]])

    def test_refuses_a_bad_parent_speaker_or_swipe(self, server: TestClient, person: Any) -> None:
        ada = _create(server, person, "character", name="Ada").json()["character"]
        bram = _create(server, person, "character", name="Bram").json()["character"]
        one = _create(server, person, "chat", title="One", character_ids=[ada["id"]]).json()["chat"]
        two = _create(server, person, "chat", title="Two", character_ids=[ada["id"]]).json()["chat"]
        first = _create(server, person, "chat_message", chat_id=one["id"], role="user", swipes=["Hi"])

        def post(**body: Any) -> int:
            return int(server.post("/v1/chat_message", json={"chat_message": body}, headers=_headers(person)).status_code)

        assert post(chat_id=two["id"], parent_id=first.json()["chat_message"]["id"], role="user", swipes=["x"]) == 422
        assert post(chat_id=one["id"], role="character", speaker_character_id=bram["id"], swipes=["x"]) == 422
        assert post(chat_id=one["id"], role="user", swipes=["x"], swipe_index=1) == 422
        assert _put(server, person, "chat_message", first.json()["chat_message"]["id"], first.headers["ETag"], swipe_index=3).status_code == 422


class TestPersonasAndEndpoints:
    def test_one_default_persona(self, server: TestClient, other: Any) -> None:
        _create(server, other, "persona", name="Sam", is_default=True)
        reyes = _create(server, other, "persona", name="Reyes")
        assert _put(server, other, "persona", reyes.json()["persona"]["id"], reyes.headers["ETag"], is_default=True).status_code == 200
        listed = server.get("/v1/persona", headers=_headers(other)).json()["personas"]
        assert sorted((persona["name"], persona["is_default"]) for persona in listed) == [("Reyes", True), ("Sam", False)]

    def test_the_api_key_is_write_only(self, server: TestClient, person: Any) -> None:
        endpoint = _create(server, person, "model_endpoint", name="Hosted", base_url="https://api.example.com/v1", model="big", api_key="sk-secret").json()["model_endpoint"]
        assert endpoint["has_api_key"] is True
        read = server.get(f"/v1/model_endpoint/{endpoint['id']}", headers=_headers(person))
        assert "sk-secret" not in read.text and "api_key" not in read.json()["model_endpoint"]

    def test_refuses_an_address_that_is_not_http(self, server: TestClient, person: Any) -> None:
        refused = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "x", "base_url": "file:///etc/passwd", "model": "m"}}, headers=_headers(person))
        assert refused.status_code == 422


class TestGenerate:
    def test_streams_the_reply_without_the_table_talk(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada", description="{{char}} is an engineer.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", api_key="k-1", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        ooc = _create(server, user, "chat_message", chat_id=chat["id"], role="user", channel="ooc", swipes=["brb, coffee"]).json()["chat_message"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=ooc["id"], role="user", swipes=["I hand her the spanner."]).json()["chat_message"]

        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/event-stream")
        assert 'event: delta\ndata: {"text": "“Mind "}' in response.text
        assert 'event: done\ndata: {"dropped": 0}' in response.text

        assert len(RECEIVED) == 1
        sent = RECEIVED[0]
        assert sent["path"] == "/v1/chat/completions" and sent["authorization"] == "Bearer k-1"
        contents = [message["content"] for message in sent["body"]["messages"]]
        assert "Ada is an engineer." in contents[0]
        assert "I hand her the spanner." in contents
        assert "brb, coffee" not in "\n".join(contents)

    def test_world_info_reaches_the_model_and_its_timer_is_kept(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        book = _create(server, user, "lorebook", name="Kestrel").json()["lorebook"]
        _create(server, user, "lorebook_entry", lorebook_id=book["id"], keys=["spanner"], content="The Kestrel's spanners are cursed.", sticky=2)
        _create(server, user, "lorebook_entry", lorebook_id=book["id"], keys=["coffee"], content="never: only table talk says coffee")
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], lorebook_ids=[book["id"]]).json()["chat"]
        ooc = _create(server, user, "chat_message", chat_id=chat["id"], role="user", channel="ooc", swipes=["brb, coffee"]).json()["chat_message"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=ooc["id"], role="user", swipes=["I hand her the spanner."]).json()["chat_message"]

        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        system = RECEIVED[0]["body"]["messages"][0]["content"]
        assert "The Kestrel's spanners are cursed." in system
        assert "never: only table talk says coffee" not in system
        timers = server.get(f"/v1/chat_lore_state?chat_id={chat['id']}", headers=_headers(user)).json()["chat_lore_states"]
        assert [list(state["state"].values()) for state in timers] == [[{"sticky_until": 3, "cooldown_until": 0}]]

    def test_refuses_a_lorebook_that_is_not_yours(self, server: TestClient, person: Any, other: Any) -> None:
        theirs = _create(server, other, "lorebook", name="Theirs").json()["lorebook"]
        ada = _create(server, person, "character", name="Ada").json()["character"]
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "lorebook_ids": [theirs["id"]]}}, headers=_headers(person))
        assert refused.status_code == 422, refused.text
        entry = server.post("/v1/lorebook_entry", json={"lorebook_entry": {"lorebook_id": theirs["id"], "keys": ["x"]}}, headers=_headers(person))
        assert entry.status_code == 422, entry.text

    def test_asks_for_a_model_first_and_refuses_an_unknown_chat(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        no_model = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user))
        assert no_model.status_code == 409
        assert no_model.json()["detail"]["code"] == "no_model_endpoint"
        assert server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": "missing"}}, headers=_headers(user)).status_code == 404
