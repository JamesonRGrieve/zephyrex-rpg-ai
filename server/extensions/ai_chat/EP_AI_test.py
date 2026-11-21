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
from zephyrex.extensions.ai_character.Contract import CONTRACT, LIMITS  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create

RECEIVED: list[dict[str, Any]] = []


class FakeModel(BaseHTTPRequestHandler):
    """A real HTTP server answering as an OpenAI-compatible endpoint: a two-piece streamed reply."""

    def do_GET(self) -> None:
        # AI Horde's job status (A48), done at the first poll; otherwise the model list (A28's check).
        if "/v2/generate/text/status/" in self.path:
            RECEIVED.append({"path": self.path, "apikey": self.headers.get("apikey"), "body": None})
            body = json.dumps({"done": True, "generations": [{"text": "Aye, captain."}]}).encode()
        elif self.headers.get("x-goog-api-key") or self.headers.get("x-api-key"):
            # Google's and Anthropic's own model lists (audit gap 8).
            RECEIVED.append({"path": self.path, "headers": dict(self.headers), "body": None})
            listed = {"models": [{"name": "models/gemini-tiny"}]} if self.headers.get("x-goog-api-key") else {"data": [{"id": "claude-tiny"}]}
            body = json.dumps(listed).encode()
        else:
            body = json.dumps({"data": [{"id": "tiny"}, {"id": "small"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        RECEIVED.append({"path": self.path, "authorization": self.headers.get("Authorization"), "headers": dict(self.headers), "body": json.loads(self.rfile.read(length))})
        if self.path.endswith("/messages") or ":streamGenerateContent" in self.path:
            # Anthropic's and Google's own streams (audit gap 8): thinking, then the two pieces.
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            if self.path.endswith("/messages"):
                events = [{"type": "message_start", "message": {}}, {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "Hm."}}]
                events += [{"type": "content_block_delta", "delta": {"type": "text_delta", "text": piece}} for piece in ("“Mind ", "the coolant.”")]
                events.append({"type": "message_stop"})
            else:
                events = [{"candidates": [{"content": {"parts": [{"text": "Hm.", "thought": True}]}}]}]
                events += [{"candidates": [{"content": {"role": "model", "parts": [{"text": piece}]}}]} for piece in ("“Mind ", "the coolant.”")]
            for event in events:
                self.wfile.write(f"event: x\ndata: {json.dumps(event)}\n\n".encode())
            return
        if self.path.endswith("/v2/generate/text/async"):
            RECEIVED[-1]["apikey"] = self.headers.get("apikey")
            RECEIVED[-1]["agent"] = self.headers.get("Client-Agent")
            body = json.dumps({"id": "job-1"}).encode()
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.endswith("/embeddings"):
            # Recall by meaning (A19): a line's vector counts the words "coolant" and "valve".
            inputs = RECEIVED[-1]["body"]["input"]
            data = [
                {"object": "embedding", "index": index, "embedding": [text.count("coolant"), text.count("valve"), 0.01]}
                for index, text in enumerate(inputs)
            ]
            body = json.dumps({"data": data}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.endswith("/audio/speech"):
            # A line spoken (A29): three bytes of "MP3".
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", "3")
            self.end_headers()
            self.wfile.write(b"ID3")
            return
        if self.path.endswith("/images/generations"):
            # A drawn picture (A30): a one-pixel PNG.
            body = json.dumps({"data": [{"b64_json": "iVBORw0KGgo="}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        text_api = not self.path.endswith("/chat/completions")
        for piece in ("“Mind ", "the coolant.”"):
            choice = {"text": piece} if text_api else {"delta": {"content": piece}}
            self.wfile.write(f"data: {json.dumps({'choices': [choice]})}\n\n".encode())
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


# The composed suite: a chat's characters are wiki persons in its wiki campaign. Each test user has one
# campaign, made on first use; _cast makes a person in it from a character card's fields (the summary
# from the description, the voice from personality, first message and examples), and a chat made
# with characters joins that campaign.
_CAMPAIGNS: dict[str, str] = {}


def _campaign(server: TestClient, user: Any) -> str:
    if user.jwt not in _CAMPAIGNS:
        _CAMPAIGNS[user.jwt] = _create(server, user, "campaign", name="The Test World").json()["campaign"]["id"]
    return _CAMPAIGNS[user.jwt]


class _Cast:
    """A created person, answering as ``_create(..., "character", ...)`` did: ``.json()["character"]``."""

    def __init__(self, person: dict[str, Any]) -> None:
        self._person = person

    def json(self) -> dict[str, Any]:
        return {"character": self._person}


def _cast(server: TestClient, user: Any, resource: str = "character", **card: Any) -> _Cast:
    assert resource == "character"
    voice = {
        key: value
        for key, value in (
            ("personality", card.get("personality")),
            ("first_message", card.get("first_message")),
            ("examples", [card["example_messages"]] if card.get("example_messages") else None),
        )
        if value
    }
    fields: dict[str, Any] = {"name": card["name"], "kind": "npc", "campaign_id": _campaign(server, user)}
    if card.get("description"):
        fields["entry"] = [{"type": "p", "children": [{"text": card["description"]}]}]
    if voice:
        fields["voice"] = voice
    person = _create(server, user, "person", **fields).json()["person"]
    return _Cast({**person, "name": card["name"]})


def _chat(server: TestClient, user: Any, resource: str = "chat", **fields: Any) -> Any:
    assert resource == "chat"
    if fields.get("character_ids") and "campaign_id" not in fields:
        fields["campaign_id"] = _campaign(server, user)
    return _create(server, user, "chat", **fields)


class TestCharacters:
    def test_defaults_and_stale_saves(self, server: TestClient, person: Any) -> None:
        created = _create(server, person, "character", name="Ada")
        character = created.json()["character"]
        assert {key: character[key] for key in ("description", "first_message", "alternate_greetings", "tags", "avatar", "favourite", "folder", "extensions")} == {
            "description": "",
            "first_message": "",
            "alternate_greetings": [],
            "tags": [],
            "avatar": None,
            "favourite": False,
            "folder": "",
            "extensions": {},
        }
        # A51: a folder, trimmed.
        assert _create(server, person, "character", name="Bram", folder="  Crew ").json()["character"]["folder"] == "Crew"
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
        theirs = _cast(server, other, "character", name="Theirs").json()["character"]
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [theirs["id"]]}}, headers=_headers(person))
        assert refused.status_code == 422, refused.text

    def test_messages_branch_list_by_chat_and_delete_whole(self, server: TestClient, person: Any) -> None:
        ada = _cast(server, person, "character", name="Ada").json()["character"]
        chat = _chat(server, person, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]

        def say(parent: str | None, text: str, **extra: Any) -> Any:
            return _create(server, person, "chat_message", **{"chat_id": chat["id"], "parent_id": parent, "role": "user", "swipes": [text], **extra})

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
        ada = _cast(server, person, "character", name="Ada").json()["character"]
        bram = _cast(server, person, "character", name="Bram").json()["character"]
        one = _chat(server, person, "chat", title="One", character_ids=[ada["id"]]).json()["chat"]
        two = _chat(server, person, "chat", title="Two", character_ids=[ada["id"]]).json()["chat"]
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
        listed = server.get("/v1/persona", headers=_headers(other)).json()["personae"]
        assert sorted((persona["name"], persona["is_default"]) for persona in listed) == [("Reyes", True), ("Sam", False)]

    def test_a_persona_places_its_description_and_locks_to_your_own_characters(self, server: TestClient, person: Any, other: Any) -> None:
        # Audit gap 9: a title, where the description goes, its own lorebook, characters it's locked to.
        ada = _create(server, person, "character", name="Ada").json()["character"]
        theirs = _create(server, other, "character", name="Theirs").json()["character"]
        book = _create(server, person, "lorebook", name="Sam's past").json()["lorebook"]
        made = _create(server, person, "persona", name="Sam", title="Deckhand", description_position="depth", description_depth=3, description_role="user", lorebook_id=book["id"], character_ids=[ada["id"]]).json()["persona"]
        assert {key: made[key] for key in ("title", "description_position", "description_depth", "description_role", "lorebook_id", "character_ids")} == {
            "title": "Deckhand", "description_position": "depth", "description_depth": 3, "description_role": "user", "lorebook_id": book["id"], "character_ids": [ada["id"]],
        }
        plain = _create(server, person, "persona", name="Plain").json()["persona"]
        assert (plain["description_position"], plain["character_ids"], plain["lorebook_id"]) == ("prompt", [], None)
        for fields in ({"character_ids": [theirs["id"]]}, {"lorebook_id": "nowhere"}, {"description_position": "sideways"}, {"description_role": "narrator"}, {"character_ids": [ada["id"], ada["id"]]}):
            refused = server.post("/v1/persona", json={"persona": {"name": "X", **fields}}, headers=_headers(person))
            assert refused.status_code == 422, (fields, refused.text)

    def test_the_api_key_is_write_only(self, server: TestClient, person: Any) -> None:
        endpoint = _create(server, person, "model_endpoint", name="Hosted", base_url="https://api.example.com/v1", model="big", api_key="sk-secret").json()["model_endpoint"]
        assert endpoint["has_api_key"] is True
        read = server.get(f"/v1/model_endpoint/{endpoint['id']}", headers=_headers(person))
        assert "sk-secret" not in read.text and "api_key" not in read.json()["model_endpoint"]
        claimed = _create(server, person, "model_endpoint", name="Claims", base_url="https://api.example.com/v1", model="big", has_api_key=True).json()["model_endpoint"]
        assert claimed["has_api_key"] is False
        long_key = "k" * (LIMITS["api_key_characters"] + 1)
        refused = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "Long", "base_url": "https://a.example/v1", "model": "m", "api_key": long_key}}, headers=_headers(person))
        assert refused.status_code == 422

    def test_a_connection_profile_names_only_your_own_model_and_preset(self, server: TestClient, person: Any, other: Any) -> None:
        # Audit gap 8: a named model and preset a chat switches to in one step.
        model = _create(server, person, "model_endpoint", name="Claude", base_url="https://api.example.com/v1", model="c", api="anthropic").json()["model_endpoint"]
        searcher = _create(server, person, "model_endpoint", name="Search", base_url="https://search.example", model="searxng", api="searxng", roles=["search"]).json()["model_endpoint"]
        preset = _create(server, person, "generation_preset", name="Careful").json()["generation_preset"]
        theirs = _create(server, other, "generation_preset", name="Theirs").json()["generation_preset"]
        made = _create(server, person, "connection_profile", name="Long scenes", endpoint_id=model["id"], preset_id=preset["id"])
        assert {key: made.json()["connection_profile"][key] for key in ("name", "endpoint_id", "preset_id")} == {"name": "Long scenes", "endpoint_id": model["id"], "preset_id": preset["id"]}
        for fields in ({"endpoint_id": searcher["id"]}, {"preset_id": theirs["id"]}, {"preset_id": "nope"}):
            refused = server.post("/v1/connection_profile", json={"connection_profile": {"name": "x", **fields}}, headers=_headers(person))
            assert refused.status_code == 422, (fields, refused.text)
        listed = server.get("/v1/connection_profile", headers=_headers(person)).json()["connection_profiles"]
        assert [row["name"] for row in listed] == ["Long scenes"]
        assert server.get("/v1/connection_profile", headers=_headers(other)).json()["connection_profiles"] == []

    def test_refuses_an_address_that_is_not_http(self, server: TestClient, person: Any) -> None:
        refused = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "x", "base_url": "file:///etc/passwd", "model": "m"}}, headers=_headers(person))
        assert refused.status_code == 422


class TestGenerate:
    def test_streams_the_reply_without_the_table_talk(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="{{char}} is an engineer.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", api_key="k-1", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
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

    @pytest.mark.xfail(reason="waiting on the wiki: a person's voice has no system_prompt, relayed for the Wiki", strict=True)
    def test_a_text_api_gets_one_prompt_in_its_instruct_template(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", system_prompt="You are Ada.").json()["character"]
        bad = server.post(
            "/v1/model_endpoint", json={"model_endpoint": {"name": "Bad", "base_url": model_url, "model": "tiny", "api": "smoke"}}, headers=_headers(user)
        )
        assert bad.status_code == 422, bad.text
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", api="text", instruct_template="alpaca", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hello."]).json()["chat_message"]
        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        assert 'event: delta\ndata: {"text": "“Mind "}' in response.text
        sent = RECEIVED[0]
        assert sent["path"] == "/v1/completions"
        assert sent["body"]["prompt"] == "You are Ada.\n\n### Instruction:\nHello.\n\n### Response:\n"
        # The person's name ends the reply too (the group guards, Group.py), then the template's own stops.
        assert sent["body"]["stop"] == ["\nUser:", "### Instruction:"]
        assert "messages" not in sent["body"]

    def test_summarizes_the_branch_and_reads_the_summary_back_into_the_prompt(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        created = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]])
        chat = created.json()["chat"]
        ooc = _create(server, user, "chat_message", chat_id=chat["id"], role="user", channel="ooc", swipes=["brb"]).json()["chat_message"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=ooc["id"], role="user", swipes=["We dock."]).json()["chat_message"]
        RECEIVED.clear()
        summarized = server.post("/v1/ai_chat/summarize", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert summarized.status_code == 200, summarized.text
        assert summarized.json()["summary"] == {"text": "“Mind the coolant.”", "dropped": 0}
        assert RECEIVED[0]["body"]["messages"][1]["content"] == "User: We dock."
        # The chat's version moves as messages are written to it, so the edit is made against the latest.
        latest = server.get(f"/v1/chat/{chat['id']}", headers=_headers(user))
        saved = _put(server, user, "chat", chat["id"], latest.headers["ETag"], summary="They docked.")
        assert saved.status_code == 200, saved.text
        inspected = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user)).json()["prompt"]
        assert inspected["messages"][0]["content"].endswith("Summary of the story so far:\nThey docked.")

    def test_regex_scripts_are_checked_ordered_and_rewrite_the_prompt(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        for refused in ({"find": "/(/"}, {"find": "/a/u"}, {"find": "/a/", "placements": []}, {"find": "/a/", "display_only": True, "prompt_only": True}):
            answer = server.post("/v1/regex_script", json={"regex_script": {"name": "Bad", **refused}}, headers=_headers(user))
            assert answer.status_code == 422, (refused, answer.text)
        _create(server, user, "regex_script", name="Second", find="/spanner/g", replace="wrench", placements=["user_input"], prompt_only=True, position=2)
        _create(server, user, "regex_script", name="First", find="/hand/", replace="pass", placements=["user_input"], prompt_only=True, position=1)
        _create(server, user, "regex_script", name="Shown", find="/her/", replace="HER", placements=["user_input"], display_only=True)
        names = [script["name"] for script in server.get("/v1/regex_script", headers=_headers(user)).json()["regex_scripts"]]
        assert names == ["Shown", "First", "Second"]
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I hand her the spanner."]).json()["chat_message"]
        inspected = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user)).json()["prompt"]
        assert inspected["messages"][-1]["content"] == "I pass her the wrench."

    def test_quick_replies_are_checked_and_listed_in_order(self, server: TestClient) -> None:
        user = create_user(server)
        refused = server.post("/v1/quick_reply", json={"quick_reply": {"label": "Bad", "message": "x", "action": "shout"}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        _create(server, user, "quick_reply", label="Look", message="I look around.", position=2)
        _create(server, user, "quick_reply", label="Pause", message="Can we pause?", channel="ooc", action="fill", position=1)
        listed = server.get("/v1/quick_reply", headers=_headers(user)).json()["quick_replies"]
        assert [(row["label"], row["action"], row["channel"]) for row in listed] == [("Pause", "fill", "ooc"), ("Look", "send", "ic")]

    def test_a_quick_reply_runs_by_itself_but_never_without_end(self, server: TestClient) -> None:
        user = create_user(server)
        opener = _create(server, user, "quick_reply", label="Recap", message="Where were we?", channel="ooc", auto_run="chat_open").json()["quick_reply"]
        assert (opener["action"], opener["auto_run"]) == ("send", "chat_open")
        filler = _create(server, user, "quick_reply", label="Next", message="I ", action="fill", auto_run="after_reply")
        assert filler.status_code == 201, filler.text
        # Sending after a reply would ask the model again, and run again: refused.
        looping = server.post("/v1/quick_reply", json={"quick_reply": {"label": "Loop", "message": "Go on.", "auto_run": "after_reply"}}, headers=_headers(user))
        assert looping.status_code == 422, looping.text
        assert server.post("/v1/quick_reply", json={"quick_reply": {"label": "Bad", "message": "x", "auto_run": "hourly"}}, headers=_headers(user)).status_code == 422
        # Nor can an update make one loop.
        made_loop = _put(server, user, "quick_reply", filler.json()["quick_reply"]["id"], filler.headers["ETag"], action="send")
        assert made_loop.status_code == 422, made_loop.text

    def test_a_text_api_uses_the_persons_own_instruct_template(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        stranger = create_user(server)
        theirs = _create(server, stranger, "instruct_template", name="Theirs").json()["instruct_template"]
        mine = _create(
            server, user, "instruct_template", name="Bracketed", system_prefix="[SYS] ", user_prefix="[ME] ", user_suffix="\n", assistant_prefix="[AI] ", stop=["[ME]"]
        ).json()["instruct_template"]
        bad = server.post("/v1/instruct_template", json={"instruct_template": {"name": "Bad", "stop": [""]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        refused = server.post(
            "/v1/model_endpoint",
            json={"model_endpoint": {"name": "Theirs", "base_url": model_url, "model": "tiny", "api": "text", "custom_template_id": theirs["id"]}},
            headers=_headers(user),
        )
        assert refused.status_code == 422, refused.text
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", api="text", custom_template_id=mine["id"], is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Ready?"]).json()["chat_message"]
        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        sent = RECEIVED[0]["body"]
        assert sent["prompt"].startswith("[SYS] ") and "[ME] Ready?\n" in sent["prompt"] and sent["prompt"].endswith("[AI] ")
        assert "[ME]" in sent["stop"]

    def test_the_ai_horde_answers_as_a_job(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Horde", base_url=model_url.removesuffix("/v1") + "/api", model="koboldcpp/tiny", api="horde", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Ready?"]).json()["chat_message"]
        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        assert 'event: delta\ndata: {"text": "Aye, captain."}' in response.text
        submit, poll = RECEIVED[0], RECEIVED[1]
        assert submit["path"] == "/api/v2/generate/text/async"
        assert (submit["apikey"], submit["agent"]) == ("0000000000", "zephyrex-rpg-ai:0.1:self-hosted")
        assert submit["body"]["models"] == ["koboldcpp/tiny"] and "Ready?" in submit["body"]["prompt"]
        assert poll["path"] == "/api/v2/generate/text/status/job-1"

    def test_a_message_moves_up_its_branch(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        first = _create(server, user, "chat_message", chat_id=chat["id"], role="character", speaker_character_id=ada["id"], swipes=["Hello."]).json()["chat_message"]
        second = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=first["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        third = _create(
            server, user, "chat_message", chat_id=chat["id"], parent_id=second["id"], role="character", speaker_character_id=ada["id"], swipes=["Mind it."]
        ).json()["chat_message"]
        moved = server.post("/v1/ai_chat/move", json={"move": {"message_id": third["id"]}}, headers=_headers(user))
        assert moved.status_code == 200, moved.text
        assert moved.json() == {"move": {"message_id": second["id"]}}
        upper = server.get(f"/v1/chat_message/{second['id']}", headers=_headers(user)).json()["chat_message"]
        lower = server.get(f"/v1/chat_message/{third['id']}", headers=_headers(user)).json()["chat_message"]
        assert (upper["role"], upper["speaker_character_id"], upper["swipes"]) == ("character", ada["id"], ["Mind it."])
        assert (lower["role"], lower["speaker_character_id"], lower["swipes"], lower["parent_id"]) == ("user", None, ["Hi."], second["id"])
        assert server.post("/v1/ai_chat/move", json={"move": {"message_id": first["id"]}}, headers=_headers(user)).status_code == 422
        _create(server, user, "chat_message", chat_id=chat["id"], parent_id=first["id"], role="user", swipes=["Another."])
        refused = server.post("/v1/ai_chat/move", json={"move": {"message_id": second["id"]}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        assert server.post("/v1/ai_chat/move", json={"move": {"message_id": "nope"}}, headers=_headers(user)).status_code == 404

    def test_a_chat_keeps_its_tags_and_folder(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], tags=[" heist "], folder=" Kestrel ").json()["chat"]
        assert (chat["tags"], chat["folder"]) == (["heist"], "Kestrel")
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "tags": [""]}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        muted = _chat(server, user, "chat", title="Group", character_ids=[ada["id"]], muted_ids=[ada["id"]]).json()["chat"]
        assert muted["muted_ids"] == [ada["id"]]
        stranger = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "muted_ids": ["someone-else"]}}, headers=_headers(user))
        assert stranger.status_code == 422, stranger.text
        pictured = _chat(server, user, "chat", title="Pictured", character_ids=[ada["id"]], background="data:image/png;base64,AAAA").json()["chat"]
        assert pictured["background"] == "data:image/png;base64,AAAA"
        svg = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "background": "data:image/svg+xml;base64,AAAA"}}, headers=_headers(user))
        assert svg.status_code == 422, svg.text

    def test_translates_a_message_with_the_chats_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        RECEIVED.clear()
        answer = server.post("/v1/ai_chat/translate", json={"translate": {"chat_id": chat["id"], "text": "Bonjour.", "language": "English"}}, headers=_headers(user))
        assert answer.status_code == 200, answer.text
        assert answer.json()["translate"]["text"] == "“Mind the coolant.”"
        assert RECEIVED[0]["body"]["messages"] == [
            {"role": "system", "content": "Translate the user's text into English. Keep its meaning, tone, names and any *action* markup. Write only the translation."},
            {"role": "user", "content": "Bonjour."},
        ]
        missing = server.post("/v1/ai_chat/translate", json={"translate": {"chat_id": "nope", "text": "x", "language": "English"}}, headers=_headers(user))
        assert missing.status_code == 404

    def test_the_newest_lines_pictures_go_to_the_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        picture = "data:image/png;base64,AAAA"
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["What is this?"], images=[picture]).json()["chat_message"]
        assert line["images"] == [picture]
        RECEIVED.clear()
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert RECEIVED[0]["body"]["messages"][-1]["content"] == [
            {"type": "text", "text": "What is this?"},
            {"type": "image_url", "image_url": {"url": picture}},
        ]
        too_many = server.post(
            "/v1/chat_message", json={"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": ["x"], "images": [picture] * 5}}, headers=_headers(user)
        )
        assert too_many.status_code == 422, too_many.text

    @pytest.mark.xfail(reason="mapping item 4: waiting on the wiki's campaign_documents ability (relayed)", strict=True)
    def test_the_data_bank_reads_the_wiki_campaigns_documents(self, server: TestClient, model_url: str) -> None:
        # The composed suite: the data bank retrieves from the chat's wiki campaign's documents (whole
        # entry texts), through the wiki's campaign_documents ability, in name order.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        said = lambda text: [{"type": "p", "children": [{"text": text}]}]  # noqa: E731 - a test's shorthand
        campaign = _campaign(server, user)
        _create(server, user, "location", name="Bay Two", kind="building", campaign_id=campaign, entry=said("The coolant spare is in bay two."))
        _create(server, user, "location", name="Galley", kind="building", campaign_id=campaign, entry=said("Bram's stew is famous."))
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Where is the coolant?"]).json()["chat_message"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user)).json()["prompt"]
        system = prompt["messages"][0]["content"]
        assert "Notes that may be relevant:\nThe coolant spare is in bay two." in system
        assert "stew" not in system

    def test_safety_tools_reach_the_model_and_an_x_carded_line_does_not(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        bad = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "content_rating": "spicy"}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], content_rating="teen", lines=["spiders"], veils=[" gore "]).json()["chat"]
        assert (chat["lines"], chat["veils"]) == (["spiders"], ["gore"])
        first = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I open the crate."])
        carded = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=first.json()["chat_message"]["id"], role="character", speaker_character_id=ada["id"], swipes=["Something awful."])
        marked = _put(server, user, "chat_message", carded.json()["chat_message"]["id"], carded.headers["ETag"], x_carded=True)
        assert marked.status_code == 200, marked.text
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": carded.json()["chat_message"]["id"]}}, headers=_headers(user)).json()["prompt"]
        contents = [message["content"] for message in prompt["messages"]]
        assert "Never include, even off-screen: spiders." in contents[0] and "Only ever off-screen, never described: gore." in contents[0]
        assert "Something awful." not in "\n".join(contents)

    @pytest.mark.xfail(reason="waiting on the wiki: a person's voice has no Character's Note (depth_prompt), relayed for the Wiki", strict=True)
    def test_a_seat_at_the_table_and_the_characters_note(self, server: TestClient, model_url: str) -> None:
        # The person sits as a player or as the GM (the operator, 2026-11-21); null is a plain chat.
        user = create_user(server)
        note = {"depth_prompt": {"prompt": "[{{char}} hides a limp.]", "depth": 0, "role": "system"}}
        ada = _cast(server, user, "character", name="Ada", extensions=note).json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        wrong = {"chat": {"title": "x", "character_ids": [ada["id"]], "seat": "dm"}}
        bad = server.post("/v1/chat", json=wrong, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        plain = _chat(server, user, "chat", title="Plain", character_ids=[ada["id"]]).json()["chat"]
        assert plain["seat"] is None
        chat = _chat(server, user, "chat", title="Table", character_ids=[ada["id"]], seat="gm").json()["chat"]
        assert chat["seat"] == "gm"
        # The GM's own story line is narration; the AI party reads it so, with Ada's Character's Note last.
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="narrator", swipes=["The bridge shakes."])
        assert line.status_code == 201, line.text
        leaf = line.json()["chat_message"]["id"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": leaf, "speaker_id": ada["id"]}}
        prompt = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]
        contents = [message["content"] for message in prompt["messages"]]
        assert any("The bridge shakes." in content for content in contents)
        assert contents[-1] == "[Ada hides a limp.]"

    def test_the_table_gm_answers_and_a_pause_holds_the_story(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        bad = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "table_notes": [{"kind": "gossip", "text": "x"}]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], paused=True, table_notes=[{"kind": "house_rule", "text": " Crits explode. "}]).json()["chat"]
        assert chat["table_notes"] == [{"kind": "house_rule", "text": "Crits explode."}]
        question = _create(server, user, "chat_message", chat_id=chat["id"], role="user", channel="gm", swipes=["Can I search it?"]).json()["chat_message"]
        refused = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": question["id"]}}, headers=_headers(user))
        assert refused.status_code == 409 and refused.json()["detail"]["code"] == "paused"
        RECEIVED.clear()
        answered = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": question["id"], "mode": "table"}}, headers=_headers(user))
        assert answered.status_code == 200, answered.text
        sent = RECEIVED[0]["body"]["messages"]
        assert "House rule: Crits explode." in sent[0]["content"] and sent[-1] == {"role": "user", "content": "User: Can I search it?"}

    def test_a_chats_campaign_frame_reaches_the_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        for refused in ({"dials": {"grim_hopeful": 5}}, {"pillars": {"romance": 1}}, {"structure": "spiral"}):
            answer = server.post("/v1/campaign_frame", json={"campaign_frame": {"name": "Bad", **refused}}, headers=_headers(user))
            assert answer.status_code == 422, (refused, answer.text)
        campaign = _create(
            server, user, "campaign_frame", name="The Kestrel", premise="Smugglers on a dying freighter.", truths=[" The Guild owns every port. "], gm_style="Terse.", wiki_campaign_id=_campaign(server, user)
        ).json()["campaign_frame"]
        assert campaign["truths"] == ["The Guild owns every port."]
        stranger = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "campaign_id": "nope"}}, headers=_headers(user))
        assert stranger.status_code == 422, stranger.text
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], campaign_id=campaign["id"]).json()["chat"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user)).json()["prompt"]
        assert "Premise: Smugglers on a dying freighter.\nSetting truths:\n- The Guild owns every port." in prompt["messages"][0]["content"]
        # The GM style (A20) is the GM's: a character's reply never reads it, the narration does.
        assert "Terse." not in prompt["messages"][0]["content"]
        narration = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "mode": "narrate"}}, headers=_headers(user)).json()["prompt"]
        assert "How you run the game, as the table asked: Terse." in narration["messages"][0]["content"]

    def test_a_running_scenario_is_the_gms_view(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        for refused in (
            {"clocks": [{"name": "x", "segments": 1, "filled": 0, "advances": "", "when_full": ""}]},
            {"clocks": [{"name": "x", "segments": 4, "filled": 5, "advances": "", "when_full": ""}]},
            {"secrets": [{"truth": "x", "clues": [{"text": "y"}]}]},
            {"cast": [{"name": " ", "agenda": "", "secret": "", "disposition": ""}]},
        ):
            answer = server.post("/v1/scenario", json={"scenario": {"name": "Bad", **refused}}, headers=_headers(user))
            assert answer.status_code == 422, (refused, answer.text)
        scenario = _create(
            server,
            user,
            "scenario",
            name="Sabotage",
            premise="Someone cuts the coolant line.",
            clocks=[{"name": "The pump fails", "segments": 4, "filled": 3, "advances": "a jump", "when_full": "the ship drifts"}],
            secrets=[{"truth": "Reyes cut it.", "clues": [{"text": "Cut marks", "found": True}]}],
        ).json()["scenario"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], scenario_id=scenario["id"]).json()["chat"]
        system = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user)).json()["prompt"]["messages"][0]["content"]
        assert "- The pump fails: 3/4 (close to filling); advances when a jump; when full: the ship drifts" in system
        assert "- Reyes cut it. [learned]. Clues: Cut marks (found)" in system

    def test_the_narrator_speaks_for_the_world(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="{{char}} fixes engines.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I step inside."]).json()["chat_message"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "mode": "narrate"}}, headers=_headers(user)).json()["prompt"]
        assert prompt["messages"][0]["content"].startswith("You are the game master, narrating this story.")
        assert "- Ada: Ada fixes engines." in prompt["messages"][0]["content"]
        assert prompt["messages"][-1]["content"] == "User: I step inside."

    def test_each_role_goes_to_the_model_serving_it(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        _create(server, user, "model_endpoint", name="Summaries", base_url=model_url, model="small", roles=["summary"])
        bad = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "x", "base_url": model_url, "model": "m", "roles": ["poetry"]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["We dock."]).json()["chat_message"]
        RECEIVED.clear()
        server.post("/v1/ai_chat/summarize", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert [sent["body"]["model"] for sent in RECEIVED] == ["small", "tiny"]
        # AP4: the same turn asked of another of the person's models; another person's is not found.
        RECEIVED.clear()
        other = _create(server, user, "model_endpoint", name="Other", base_url=model_url, model="big").json()["model_endpoint"]
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "endpoint_id": other["id"]}}, headers=_headers(user))
        assert [sent["body"]["model"] for sent in RECEIVED] == ["big"]
        stranger = create_user(server)
        theirs = _create(server, stranger, "model_endpoint", name="Theirs", base_url=model_url, model="x").json()["model_endpoint"]
        refused = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "endpoint_id": theirs["id"]}}, headers=_headers(user))
        assert refused.status_code == 404, refused.text

    def test_the_model_check_says_whether_the_server_answers(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        up = _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny").json()["model_endpoint"]
        down = _create(server, user, "model_endpoint", name="Gone", base_url="http://127.0.0.1:9/v1", model="x").json()["model_endpoint"]
        answered = server.post("/v1/ai_chat/ping", json={"ping": {"endpoint_id": up["id"]}}, headers=_headers(user)).json()["ping"]
        assert (answered["ok"], answered["has_model"], answered["detail"]) == (True, True, "2 models offered")
        gone = server.post("/v1/ai_chat/ping", json={"ping": {"endpoint_id": down["id"]}}, headers=_headers(user)).json()["ping"]
        assert (gone["ok"], gone["status"], gone["detail"]) == (False, None, "The server could not be reached")

    def test_a_presets_logit_bias_and_guidance_reach_the_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        bad = server.post("/v1/generation_preset", json={"generation_preset": {"name": "x", "logit_bias": {"abc": 1}}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        preset = _create(server, user, "generation_preset", name="Steered", logit_bias={"50256": -100}, negative_prompt="purple prose", guidance_scale=1.5).json()["generation_preset"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], preset_id=preset["id"]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        RECEIVED.clear()
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert {key: RECEIVED[0]["body"][key] for key in ("logit_bias", "negative_prompt", "guidance_scale")} == {"logit_bias": {"50256": -100}, "negative_prompt": "purple prose", "guidance_scale": 1.5}

    def test_an_endpoints_extra_request_fields_reach_the_model_never_over_the_conversation(self, server: TestClient, model_url: str) -> None:
        # SillyTavern's additional parameters: e.g. reasoning_effort "none" to stop a model thinking.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        refused = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "x", "base_url": model_url, "model": "tiny", "extra_body": {"stream": False}}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        made = _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True, extra_body={"reasoning_effort": "none", "temperature": 0.1}).json()["model_endpoint"]
        assert made["extra_body"] == {"reasoning_effort": "none", "temperature": 0.1}
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        RECEIVED.clear()
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        body = RECEIVED[0]["body"]
        assert (body["reasoning_effort"], body["temperature"], body["model"], body["stream"]) == ("none", 0.1, "tiny", True)

    def test_a_group_joins_every_members_card_and_its_own_scenario(self, server: TestClient, model_url: str) -> None:
        # Audit gap 6: join mode puts every member's card in the prompt; the group scenario replaces the cards'.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="{{char}} is an engineer.", scenario="Docked.").json()["character"]
        bram = _cast(server, user, "character", name="Bram", description="{{char}} is the cook.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "group_settings": {"order": "random"}}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        settings = {"card_mode": "join", "scenario": "A storm hits.", "order": "pooled"}
        chat = _chat(server, user, "chat", title="Crew", character_ids=[ada["id"], bram["id"]], group_settings=settings).json()["chat"]
        assert chat["group_settings"] == settings
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "speaker_id": bram["id"]}}
        system = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]["messages"][0]["content"]
        assert "<Ada>\nAda is an engineer.\n</Ada>" in system and "<Bram>\nBram is the cook.\n</Bram>" in system, system
        assert "Scenario: A storm hits." in system and "Docked." not in system, system

    def test_gen_answers_after_the_chats_prompt_and_genraw_alone(self, server: TestClient, model_url: str) -> None:
        # Audit gap 5: STscript's /gen and /genraw ask the chat's model; nothing is written.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        for raw in (False, True):
            RECEIVED.clear()
            answer = server.post("/v1/ai_chat/gen", json={"gen": {"chat_id": chat["id"], "leaf_id": line["id"], "prompt": "Name a port.", "raw": raw}}, headers=_headers(user))
            assert answer.status_code == 200, answer.text
            assert answer.json()["gen"]["text"] == "“Mind the coolant.”"
            sent = RECEIVED[0]["body"]["messages"]
            if raw:
                assert sent == [{"role": "user", "content": "Name a port."}]
            else:
                assert sent[-1] == {"role": "system", "content": "Name a port."} and len(sent) > 2
        listed = server.get(f"/v1/chat_message?chat_id={chat['id']}", headers=_headers(user)).json()["chat_messages"]
        assert len(listed) == 1
        refused = server.post("/v1/ai_chat/gen", json={"gen": {"chat_id": chat["id"], "prompt": "   "}}, headers=_headers(user))
        assert refused.status_code == 422

    def test_a_chats_injections_reach_the_prompt_and_are_checked(self, server: TestClient, model_url: str) -> None:
        # Audit gap 5: STscript's /inject keeps named injections with the chat until flushed.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        twice = [{"id": "a", "text": "x", "position": "chat", "depth": 1, "role": "system"}] * 2
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "injections": twice}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        injections = [
            {"id": "tone", "text": "A grim tale.", "position": "before", "depth": 4, "role": "system"},
            {"id": "weather", "text": "It is raining.", "position": "chat", "depth": 0, "role": "user"},
        ]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], injections=injections).json()["chat"]
        assert chat["injections"] == injections
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        messages = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user)).json()["prompt"]["messages"]
        assert messages[0]["content"].startswith("A grim tale.\n\n")
        assert {"role": messages[-1]["role"], "content": messages[-1]["content"]} == {"role": "user", "content": "It is raining."}

    def test_next_turn_is_undecided_without_a_usable_decision(self, server: TestClient, model_url: str) -> None:
        # The operator, 2026-11-21: the decision model picks who speaks next; without one, or without a
        # usable answer, the caller keeps its turn order.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        bram = _cast(server, user, "character", name="Bram").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Crew", character_ids=[ada["id"], bram["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["*yawn*"]).json()["chat_message"]
        asked = {"next_turn": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        undecided = {"decided": False, "kind": None, "character_id": None}
        assert server.post("/v1/ai_chat/next_turn", json=asked, headers=_headers(user)).json()["next_turn"] == undecided
        _create(server, user, "model_endpoint", name="Judge", base_url=model_url, model="tiny", roles=["decide"])
        answer = server.post("/v1/ai_chat/next_turn", json=asked, headers=_headers(user))
        assert answer.status_code == 200, answer.text
        assert answer.json()["next_turn"] == undecided

    def test_needs_roll_is_undecided_without_a_usable_decision(self, server: TestClient, model_url: str) -> None:
        # The operator, 2026-11-21: after a character's line the decision model says whether it needs a
        # roll; without one, or without a usable answer, there's no roll step.
        user = create_user(server)
        kord = _cast(server, user, "character", name="Kord").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Crew", character_ids=[kord["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="character", speaker_character_id=kord["id"], swipes=["I force the hatch."]).json()["chat_message"]
        asked = {"needs_roll": {"chat_id": chat["id"], "leaf_id": line["id"], "character_id": kord["id"]}}
        undecided = {"decided": False, "kind": None, "person_id": None, "name": None, "difficulty": None, "formula": None, "label": None}
        assert server.post("/v1/ai_chat/needs_roll", json=asked, headers=_headers(user)).json()["needs_roll"] == undecided
        _create(server, user, "model_endpoint", name="Judge", base_url=model_url, model="tiny", roles=["decide"])
        answer = server.post("/v1/ai_chat/needs_roll", json=asked, headers=_headers(user))
        assert answer.status_code == 200, answer.text
        assert answer.json()["needs_roll"] == undecided
        stranger = {"needs_roll": {**asked["needs_roll"], "character_id": "nobody"}}
        assert server.post("/v1/ai_chat/needs_roll", json=stranger, headers=_headers(user)).status_code == 422

    def test_cut_takes_out_only_the_lines_named(self, server: TestClient) -> None:
        # Audit gap 5: STscript's /cut; the cut lines' replies move up to their parents.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        ids: list[str] = []
        for text in ("a", "b", "c", "d"):
            ids.append(_create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=[text], parent_id=ids[-1] if ids else None).json()["chat_message"]["id"])
        cut = server.post("/v1/ai_chat/cut", json={"cut": {"message_ids": [ids[1], ids[2]]}}, headers=_headers(user))
        assert cut.status_code == 200, cut.text
        left = server.get(f"/v1/chat_message?chat_id={chat['id']}", headers=_headers(user)).json()["chat_messages"]
        assert {message["id"]: message["parent_id"] for message in left} == {ids[0]: None, ids[3]: ids[0]}
        assert server.post("/v1/ai_chat/cut", json={"cut": {"message_ids": ["nobody"]}}, headers=_headers(user)).status_code == 404

    def test_a_presets_further_samplers_reach_only_the_apis_that_take_them(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat_api = _create(server, user, "model_endpoint", name="Chat", base_url=model_url, model="tiny", is_default=True).json()["model_endpoint"]
        text_api = _create(server, user, "model_endpoint", name="Text", base_url=model_url, model="tiny", api="text").json()["model_endpoint"]
        bad = server.post("/v1/generation_preset", json={"generation_preset": {"name": "x", "samplers": {"min_p": 3}}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        samplers = {"min_p": 0.05, "presence_penalty": 0.4, "dry_base": 2, "seed": 7}
        preset = _create(server, user, "generation_preset", name="Tuned", samplers=samplers).json()["generation_preset"]
        assert preset["samplers"] == samplers
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], preset_id=preset["id"]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        sent = {}
        for endpoint in (chat_api, text_api):
            RECEIVED.clear()
            asked = {"chat_id": chat["id"], "leaf_id": line["id"], "endpoint_id": endpoint["id"]}
            server.post("/v1/ai_chat/generate", json={"generate": asked}, headers=_headers(user))
            body = RECEIVED[0]["body"]
            sent[endpoint["name"]] = {key: body[key] for key in ("min_p", "presence_penalty", "seed", "dry_base") if key in body}
        # DRY's base never goes without its multiplier; min-P never to a chat API.
        assert sent == {"Chat": {"presence_penalty": 0.4, "seed": 7}, "Text": {"min_p": 0.05, "presence_penalty": 0.4, "seed": 7}}

    def test_anthropics_and_googles_own_apis_are_asked_in_their_shape_and_read_back(self, server: TestClient, model_url: str) -> None:
        # Audit gap 8: the request in each API's own shape, its stream (thinking included) read as any other.
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", system_prompt="You are {{char}}.").json()["character"]
        claude = _create(server, user, "model_endpoint", name="Claude", base_url=model_url, model="claude-tiny", api="anthropic", api_key="k-1").json()["model_endpoint"]
        gemini = _create(server, user, "model_endpoint", name="Gemini", base_url=model_url, model="gemini-tiny", api="google", api_key="g-1").json()["model_endpoint"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        for endpoint, path, key_header in ((claude, "/v1/messages", "x-api-key"), (gemini, "/v1/models/gemini-tiny:streamGenerateContent?alt=sse", "x-goog-api-key")):
            RECEIVED.clear()
            asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "endpoint_id": endpoint["id"]}}
            reply = server.post("/v1/ai_chat/generate", json=asked, headers=_headers(user))
            assert reply.status_code == 200, reply.text
            assert '"text": "<think>"' in reply.text or "<think>" in reply.text, reply.text
            assert "Mind " in reply.text and "the coolant." in reply.text and "event: done" in reply.text, reply.text
            sent = RECEIVED[0]
            assert sent["path"] == path
            assert sent["headers"].get(key_header) in ("k-1", "g-1") and sent["authorization"] is None
            if endpoint is claude:
                assert "Ada" in sent["body"]["system"] and sent["body"]["messages"][-1] == {"role": "user", "content": "Hi."}
            else:
                assert "Ada" in sent["body"]["systemInstruction"]["parts"][0]["text"]
                assert sent["body"]["contents"][-1] == {"role": "user", "parts": [{"text": "Hi."}]}
            ping = server.post("/v1/ai_chat/ping", json={"ping": {"endpoint_id": endpoint["id"]}}, headers=_headers(user)).json()["ping"]
            assert ping["ok"] is True and ping["has_model"] is True, ping

    @pytest.mark.xfail(reason="mapping item 3: no persona store; the seat's wiki person speaks", strict=True)
    def test_a_persona_locked_to_the_character_speaks_with_its_placed_description(self, server: TestClient, model_url: str) -> None:
        # Audit gap 9: no chosen persona and no default; the one locked to Ada is spoken as, its
        # description at depth 1 as the user's line. (World Info is the wiki's now.)
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        _create(server, user, "persona", name="Sam", description="{{user}} is a new deckhand.", description_position="depth", description_depth=1, description_role="user", character_ids=[ada["id"]])
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Where's the coolant?"]).json()["chat_message"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        messages = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]["messages"]
        assert "Sam: Sam is a new deckhand." not in messages[0]["content"]
        assert {"role": "user", "content": "Sam: Sam is a new deckhand."} in [{"role": m["role"], "content": m["content"]} for m in messages[1:]]

    def test_macros_read_the_chat_and_its_variables_and_a_reply_keeps_what_they_set(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="A pilot.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        system = "You are {{char}} ({{description}}) on {{model}}. Mood: {{getvar::mood}}.{{setvar::seen::yes}} Said: {{lastUserMessage}}"
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], system_prompt=system, variables={"mood": "grim"}).json()["chat"]
        assert chat["variables"] == {"mood": "grim"}
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Ready?"]).json()["chat_message"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        prompt = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]
        assert prompt["messages"][0]["content"].startswith("You are Ada (A pilot.) on tiny. Mood: grim. Said: Ready?")
        # The preview keeps nothing; a reply keeps what its macros set.
        assert server.get(f"/v1/chat/{chat['id']}", headers=_headers(user)).json()["chat"]["variables"] == {"mood": "grim"}
        server.post("/v1/ai_chat/generate", json=asked, headers=_headers(user))
        kept = server.get(f"/v1/chat/{chat['id']}", headers=_headers(user)).json()["chat"]["variables"]
        assert kept == {"mood": "grim", "seen": "yes"}
        too_many = {f"v{index}": "1" for index in range(CONTRACT["limits"]["chat_variables"] + 1)}
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "variables": too_many}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text

    def test_own_prompts_and_start_reply_with_reach_the_model_and_the_reply(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        own = {"id": "custom:style", "name": "Style", "content": "Write as {{char}}, briefly.", "role": "system", "position": "system", "depth": 0, "enabled": True, "max_tokens": None}
        bad = server.post("/v1/generation_preset", json={"generation_preset": {"name": "x", "prompt_layout": [{**own, "role": "narrator"}]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        layout = [own, {"id": "prefill", "content": "*{{char}} nods.*", "enabled": True}]
        preset = _create(server, user, "generation_preset", name="Own", prompt_layout=layout).json()["generation_preset"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], preset_id=preset["id"]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        messages = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]["messages"]
        assert messages[0]["content"].startswith("Write as Ada, briefly.")
        assert {"role": messages[-1]["role"], "content": messages[-1]["content"]} == {"role": "assistant", "content": "*Ada nods.*"}
        RECEIVED.clear()
        reply = server.post("/v1/ai_chat/generate", json=asked, headers=_headers(user))
        assert reply.text.index('"*Ada nods.*"') < reply.text.index("event: done"), reply.text
        assert RECEIVED[0]["body"]["messages"][-1] == {"role": "assistant", "content": "*Ada nods.*"}

    @pytest.mark.xfail(reason="waiting on the wiki: a person's voice has no system_prompt, relayed for the Wiki", strict=True)
    def test_a_template_a_model_activates_brings_its_story_string_and_names(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="A pilot.", system_prompt="You are {{char}}.").json()["character"]
        _create(server, user, "model_endpoint", name="Text", base_url=model_url, model="llama-3-8b", api="text", is_default=True)
        story = "{{#if system}}{{system}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}"
        _create(
            server, user, "instruct_template", name="Story", user_prefix="U: ", assistant_prefix="A: ",
            include_names=True, activation_regex="llama-3", story_string=story, chat_start="***",
        )
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hi."]).json()["chat_message"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        messages = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user)).json()["prompt"]["messages"]
        assert messages[0]["content"] == "You are Ada.\nA pilot.\n\n***"
        assert messages[1] == {"role": "user", "content": "User: Hi.", "tokens": messages[1]["tokens"]}
        RECEIVED.clear()
        server.post("/v1/ai_chat/generate", json=asked, headers=_headers(user))
        assert "U: User: Hi." in RECEIVED[0]["body"]["prompt"]

    @pytest.mark.xfail(reason="sprites are character-card records; a wiki person has none yet", strict=True)
    def test_a_sprite_is_chosen_only_from_the_characters_own_labels(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        none = server.post("/v1/ai_chat/expression", json={"expression": {"chat_id": chat["id"], "character_id": ada["id"], "text": "Hi."}}, headers=_headers(user))
        assert none.json() == {"expression": {"label": None}}
        picture = "data:image/png;base64,AAAA"
        _create(server, user, "character_expression", character_id=ada["id"], label="joy", image=picture)
        twice = server.post("/v1/character_expression", json={"character_expression": {"character_id": ada["id"], "label": "joy", "image": picture}}, headers=_headers(user))
        assert twice.status_code == 422, twice.text
        RECEIVED.clear()
        chosen = server.post("/v1/ai_chat/expression", json={"expression": {"chat_id": chat["id"], "character_id": ada["id"], "text": "We made it!"}}, headers=_headers(user))
        # The stub model answers with no label, so none is invented.
        assert chosen.json() == {"expression": {"label": None}}
        assert "Words: joy" in RECEIVED[0]["body"]["messages"][0]["content"]

    def test_a_picture_is_drawn_only_by_a_model_set_to_draw(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I draw my pistol."]).json()["chat_message"]
        asked = {"picture": {"chat_id": chat["id"], "leaf_id": line["id"]}}
        # No model draws, so the chat's model is never asked.
        RECEIVED.clear()
        refused = server.post("/v1/ai_chat/picture", json=asked, headers=_headers(user))
        assert refused.status_code == 409 and refused.json()["detail"]["code"] == "no_image_model", refused.text
        assert RECEIVED == []
        _create(server, user, "model_endpoint", name="Painter", base_url=model_url, model="paint", roles=["image"])
        drawn = server.post("/v1/ai_chat/picture", json=asked, headers=_headers(user))
        assert drawn.status_code == 200, drawn.text
        assert drawn.json() == {"picture": {"prompt": "An illustration of this scene: User: I draw my pistol.", "image": "data:image/png;base64,iVBORw0KGgo="}}
        assert RECEIVED[-1]["path"].endswith("/images/generations") and RECEIVED[-1]["body"]["model"] == "paint"

    @pytest.mark.xfail(reason="portraits read character cards; pictures move to the wiki and VTT", strict=True)
    def test_a_portrait_needs_no_chat_and_a_background_draws_the_place(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="A ship's engineer.", scenario="A rusted orbital dock.").json()["character"]
        odd = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "Odd", "base_url": model_url, "model": "p", "image_size": "999x1"}}, headers=_headers(user))
        assert odd.status_code == 422, odd.text
        _create(server, user, "model_endpoint", name="Painter", base_url=model_url, model="paint", roles=["image"], image_size="1024x1024")
        RECEIVED.clear()
        portrait = server.post("/v1/ai_chat/picture", json={"picture": {"kind": "portrait", "character_id": ada["id"]}}, headers=_headers(user))
        assert portrait.status_code == 200, portrait.text
        assert RECEIVED[-1]["body"]["size"] == "1024x1024"
        assert portrait.json()["picture"]["prompt"] == CONTRACT["picture"]["portrait_prefix"] + "Ada. A ship's engineer."
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        background = server.post("/v1/ai_chat/picture", json={"picture": {"kind": "background", "chat_id": chat["id"]}}, headers=_headers(user))
        assert background.status_code == 200, background.text
        assert background.json()["picture"]["prompt"] == CONTRACT["picture"]["background_prefix"] + "A rusted orbital dock."
        for bad in ({"kind": "portrait"}, {"kind": "background"}, {"kind": "mural", "chat_id": chat["id"]}):
            answer = server.post("/v1/ai_chat/picture", json={"picture": bad}, headers=_headers(user))
            assert answer.status_code == 422, (bad, answer.text)

    def test_a_search_source_serves_search_alone_and_is_never_a_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        asked = {"search": {"query": "tidal locking"}}
        refused = server.post("/v1/ai_chat/search", json=asked, headers=_headers(user))
        assert refused.status_code == 409 and refused.json()["detail"]["code"] == "no_search_source", refused.text
        for bad in ({"api": "searxng", "roles": ["story"]}, {"api": "chat", "roles": ["search"]}, {"api": "searxng", "roles": ["search", "story"]}):
            answer = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "Bad", "base_url": model_url, "model": "m", **bad}}, headers=_headers(user))
            assert answer.status_code == 422, (bad, answer.text)
        _create(server, user, "model_endpoint", name="Searx", base_url="http://127.0.0.1:9", model="searxng", api="searxng", roles=["search"], is_default=True)
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny")
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hello."]).json()["chat_message"]
        RECEIVED.clear()
        reply = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert reply.status_code == 200, reply.text
        # The default endpoint is the search source, but the reply was asked of the model.
        assert RECEIVED and RECEIVED[-1]["body"]["model"] == "tiny"
        unreachable = server.post("/v1/ai_chat/search", json=asked, headers=_headers(user))
        assert unreachable.status_code == 200 and unreachable.json()["search"]["results"] == [], unreachable.text
        assert server.post("/v1/ai_chat/search", json={"search": {"query": "  "}}, headers=_headers(user)).status_code == 422

    def test_older_lines_are_recalled_by_meaning_and_forgotten_with_the_chat(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        said = ["The coolant pump is failing.", "The valve is rusted."]
        said += [f"Nothing much {index}." for index in range(CONTRACT["memory"]["recent_turns"] - 1)]
        said += ["Check the coolant again."]
        parent = None
        for index, text in enumerate(said):
            speaker = {"role": "user"} if index % 2 == 0 else {"role": "character", "speaker_character_id": ada["id"]}
            parent = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=parent, swipes=[text], **speaker).json()["chat_message"]["id"]
        asked = {"generate": {"chat_id": chat["id"], "leaf_id": parent}}

        def system() -> str:
            prompt = server.post("/v1/ai_chat/prompt", json=asked, headers=_headers(user))
            assert prompt.status_code == 200, prompt.text
            content: str = prompt.json()["prompt"]["messages"][0]["content"]
            return content

        RECEIVED.clear()
        assert "Earlier in the story" not in system()
        assert not [one for one in RECEIVED if one["path"].endswith("/embeddings")]

        _create(server, user, "model_endpoint", name="Embeddings", base_url=model_url, model="nomic-embed-text", api_key="k-e", roles=["embed"])
        assert "Earlier in the story:\nUser: The coolant pump is failing." in system()
        embedded = [one for one in RECEIVED if one["path"].endswith("/embeddings")]
        assert embedded[0]["authorization"] == "Bearer k-e"
        assert embedded[0]["body"] == {
            "model": "nomic-embed-text",
            "input": ["User: Nothing much 10.\nAda: Check the coolant again.", "User: The coolant pump is failing.", "Ada: The valve is rusted."],
        }
        # Next turn, only the question is embedded.
        system()
        assert len([one for one in RECEIVED if one["path"].endswith("/embeddings")][-1]["body"]["input"]) == 1

        memories = server.get("/v1/memory", headers=_headers(user))
        assert memories.status_code == 200, memories.text
        assert len(next(iter(memories.json().values()))) == 2
        etag = server.get(f"/v1/chat/{chat['id']}", headers=_headers(user)).headers["ETag"]
        assert server.delete(f"/v1/chat/{chat['id']}", headers=_headers(user, **{"If-Match": etag})).status_code in (200, 204)
        assert next(iter(server.get("/v1/memory", headers=_headers(user)).json().values())) == []

    @pytest.mark.xfail(reason="mapping item 5: memories across chats keyed on the wiki person", strict=True)
    def test_a_character_remembers_across_chats_only_when_set_and_only_its_own(
        self, server: TestClient, model_url: str
    ) -> None:
        def chat_with(user: Any, character: dict[str, Any], said: list[str]) -> dict[str, Any]:
            chat = _chat(server, user, "chat", title="Chat", character_ids=[character["id"]]).json()["chat"]
            parent = None
            for index, text in enumerate(said):
                speaker = (
                    {"role": "user"}
                    if index % 2 == 0
                    else {"role": "character", "speaker_character_id": character["id"]}
                )
                parent = _create(
                    server, user, "chat_message", chat_id=chat["id"], parent_id=parent, swipes=[text], **speaker
                ).json()["chat_message"]["id"]
            return {"chat_id": chat["id"], "leaf_id": parent}

        def system(user: Any, asked: dict[str, Any]) -> str:
            prompt = server.post("/v1/ai_chat/prompt", json={"generate": asked}, headers=_headers(user))
            assert prompt.status_code == 200, prompt.text
            content: str = prompt.json()["prompt"]["messages"][0]["content"]
            return content

        def remembering(user: Any, character: dict[str, Any]) -> None:
            fresh = server.get(f"/v1/character/{character['id']}", headers=_headers(user))
            flagged = _put(
                server,
                user,
                "character",
                character["id"],
                fresh.headers["ETag"],
                extensions={**fresh.json()["character"]["extensions"], CONTRACT["memory"]["extension"]: {"across_chats": True}},
            )
            assert flagged.status_code == 200, flagged.text

        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        bo = _cast(server, user, "character", name="Bo").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        _create(server, user, "model_endpoint", name="Embeddings", base_url=model_url, model="nomic-embed-text", roles=["embed"])
        older = ["The coolant pump is failing.", "The valve is rusted."]
        older += [f"Nothing much {index}." for index in range(CONTRACT["memory"]["recent_turns"] - 1)]
        older += ["Check the coolant again."]
        # The first chat's older lines are remembered as it is played.
        assert "Earlier in the story:\nUser: The coolant pump is failing." in system(user, chat_with(user, ada, older))

        later = chat_with(user, ada, ["Where were we?", "Check the coolant."])
        assert "From other chats" not in system(user, later)
        remembering(user, ada)
        assert "Earlier in the story:\nFrom other chats with Ada:\nUser: The coolant pump is failing." in system(user, later)

        # A character who was not in that chat recalls nothing from it, flag or not.
        remembering(user, bo)
        assert "Earlier in the story" not in system(user, chat_with(user, bo, ["Where were we?", "Check the coolant."]))

        # Nor does anyone else's character, whatever it is called.
        someone = create_user(server)
        _create(server, someone, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        _create(server, someone, "model_endpoint", name="Embeddings", base_url=model_url, model="nomic-embed-text", roles=["embed"])
        their_ada = _cast(server, someone, "character", name="Ada").json()["character"]
        remembering(someone, their_ada)
        assert "Earlier in the story" not in system(someone, chat_with(someone, their_ada, ["Where were we?", "Check the coolant."]))

    def test_a_line_is_read_aloud_only_by_a_model_set_to_speak(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        asked = {"speech": {"text": "Mind the coolant.", "voice": "af_bella", "speed": 1.5}}
        # No model speaks, so the chat's model is never asked.
        RECEIVED.clear()
        refused = server.post("/v1/ai_chat/speech", json=asked, headers=_headers(user))
        assert refused.status_code == 409 and refused.json()["detail"]["code"] == "no_voice_model", refused.text
        assert RECEIVED == []
        _create(server, user, "model_endpoint", name="Voices", base_url=model_url, model="kokoro", api_key="k-9", roles=["voice"])
        spoken = server.post("/v1/ai_chat/speech", json=asked, headers=_headers(user))
        assert spoken.status_code == 200, spoken.text
        assert spoken.json() == {"speech": {"audio": "data:audio/mpeg;base64,SUQz"}}
        assert RECEIVED[-1]["path"].endswith("/audio/speech") and RECEIVED[-1]["authorization"] == "Bearer k-9"
        assert RECEIVED[-1]["body"] == {"model": "kokoro", "input": "Mind the coolant.", "voice": "af_bella", "speed": 1.5, "response_format": "mp3"}
        for bad in ({"text": "   "}, {"text": "x" * (CONTRACT["speech"]["text_characters"] + 1)}, {"text": "Hi.", "speed": 9}, {"text": "Hi.", "voice": ""}):
            answer = server.post("/v1/ai_chat/speech", json={"speech": bad}, headers=_headers(user))
            assert answer.status_code == 422, (bad, answer.text)

    def test_world_info_runs_over_the_wiki_campaigns_entities(self, server: TestClient, model_url: str) -> None:
        # The composed suite: World Info activates the chat's wiki campaign's entities by their names,
        # aliases and keywords, read through the wiki's own ability; table talk never wakes one.
        user = create_user(server)
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        world = _create(server, user, "campaign", name="The Salt Coast").json()["campaign"]
        _CAMPAIGNS[user.jwt] = world["id"]
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        said = lambda text: [{"type": "p", "children": [{"text": text}]}]  # noqa: E731 - a test's shorthand
        _create(server, user, "location", name="The Kestrel's Hold", kind="building", campaign_id=world["id"], aliases=["spanner locker"], keywords=["spanner"], entry=said("The Kestrel's spanners are cursed."))
        _create(server, user, "location", name="Coffee House", kind="building", campaign_id=world["id"], entry=said("never: only table talk says coffee"))
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "campaign_id": "not-a-campaign"}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], campaign_id=world["id"]).json()["chat"]
        ooc = _create(server, user, "chat_message", chat_id=chat["id"], role="user", channel="ooc", swipes=["brb, coffee"]).json()["chat_message"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=ooc["id"], role="user", swipes=["I hand her the spanner."]).json()["chat_message"]

        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        system = RECEIVED[0]["body"]["messages"][0]["content"]
        assert "The Kestrel's spanners are cursed." in system, system
        assert "never: only table talk says coffee" not in system

    def test_refuses_a_lorebook_that_is_not_yours(self, server: TestClient, person: Any, other: Any) -> None:
        theirs = _create(server, other, "lorebook", name="Theirs").json()["lorebook"]
        ada = _cast(server, person, "character", name="Ada").json()["character"]
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "lorebook_ids": [theirs["id"]]}}, headers=_headers(person))
        assert refused.status_code == 422, refused.text
        entry = server.post("/v1/lorebook_entry", json={"lorebook_entry": {"lorebook_id": theirs["id"], "keys": ["x"]}}, headers=_headers(person))
        assert entry.status_code == 422, entry.text

    def test_the_inspector_shows_the_prompt_without_asking_the_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I hand her the spanner."]).json()["chat_message"]
        RECEIVED.clear()
        inspected = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "mode": "impersonate"}}, headers=_headers(user))
        assert inspected.status_code == 200, inspected.text
        prompt = inspected.json()["prompt"]
        assert prompt["messages"][-1]["content"].startswith("Write User's next reply")
        assert prompt["tokens"] == sum(message["tokens"] for message in prompt["messages"])
        assert RECEIVED == []
        assert server.get(f"/v1/chat_lore_state?chat_id={chat['id']}", headers=_headers(user)).json()["chat_lore_states"] == []
        bad = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "mode": "sing"}}, headers=_headers(user))
        assert bad.status_code == 422

    def test_the_prompt_manager_layout_and_the_chats_system_prompt(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada", description="Ada fixes engines.", example_messages="<START>").json()["character"]
        for refused in ([{"id": "nonsense", "enabled": True, "max_tokens": None}], [{"id": "main", "enabled": True, "max_tokens": None}] * 2):
            answer = server.post("/v1/generation_preset", json={"generation_preset": {"name": "Bad", "prompt_layout": refused}}, headers=_headers(user))
            assert answer.status_code == 422, answer.text
        layout = [{"id": "description", "enabled": True, "max_tokens": None}, {"id": "examples", "enabled": False, "max_tokens": None}]
        preset = _create(server, user, "generation_preset", name="Layout", prompt_layout=layout).json()["generation_preset"]
        assert preset["prompt_layout"] == layout
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]], preset_id=preset["id"], system_prompt="Narrate {{char}}.").json()["chat"]
        inspected = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user))
        assert inspected.status_code == 200, inspected.text
        assert inspected.json()["prompt"]["messages"][0]["content"] == "Ada fixes engines.\n\nNarrate Ada."

    def test_asks_for_a_model_first_and_refuses_an_unknown_chat(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _cast(server, user, "character", name="Ada").json()["character"]
        chat = _chat(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        no_model = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user))
        assert no_model.status_code == 409
        assert no_model.json()["detail"]["code"] == "no_model_endpoint"
        assert server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": "missing"}}, headers=_headers(user)).status_code == 404
