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
from zephyrex.extensions.ai_character.Contract import LIMITS  # type: ignore[import-not-found]
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
        listed = server.get("/v1/persona", headers=_headers(other)).json()["personae"]
        assert sorted((persona["name"], persona["is_default"]) for persona in listed) == [("Reyes", True), ("Sam", False)]

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

    def test_a_text_api_gets_one_prompt_in_its_instruct_template(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada", system_prompt="You are Ada.").json()["character"]
        bad = server.post(
            "/v1/model_endpoint", json={"model_endpoint": {"name": "Bad", "base_url": model_url, "model": "tiny", "api": "smoke"}}, headers=_headers(user)
        )
        assert bad.status_code == 422, bad.text
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", api="text", instruct_template="alpaca", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Hello."]).json()["chat_message"]
        RECEIVED.clear()
        response = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert response.status_code == 200, response.text
        assert 'event: delta\ndata: {"text": "“Mind "}' in response.text
        sent = RECEIVED[0]
        assert sent["path"] == "/v1/completions"
        assert sent["body"]["prompt"] == "You are Ada.\n\n### Instruction:\nHello.\n\n### Response:\n"
        assert sent["body"]["stop"] == ["### Instruction:"]
        assert "messages" not in sent["body"]

    def test_summarizes_the_branch_and_reads_the_summary_back_into_the_prompt(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        created = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]])
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
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
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

    def test_a_chat_keeps_its_tags_and_folder(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], tags=[" heist "], folder=" Kestrel ").json()["chat"]
        assert (chat["tags"], chat["folder"]) == (["heist"], "Kestrel")
        refused = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "tags": [""]}}, headers=_headers(user))
        assert refused.status_code == 422, refused.text
        muted = _create(server, user, "chat", title="Group", character_ids=[ada["id"]], muted_ids=[ada["id"]]).json()["chat"]
        assert muted["muted_ids"] == [ada["id"]]
        stranger = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "muted_ids": ["someone-else"]}}, headers=_headers(user))
        assert stranger.status_code == 422, stranger.text
        pictured = _create(server, user, "chat", title="Pictured", character_ids=[ada["id"]], background="data:image/png;base64,AAAA").json()["chat"]
        assert pictured["background"] == "data:image/png;base64,AAAA"
        svg = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "background": "data:image/svg+xml;base64,AAAA"}}, headers=_headers(user))
        assert svg.status_code == 422, svg.text

    def test_translates_a_message_with_the_chats_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
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
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
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

    def test_the_data_bank_finds_what_the_story_is_about(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        _create(server, user, "data_document", name="Ship", text="The coolant spare is in bay two.")
        _create(server, user, "data_document", name="Ada", text="Ada once rebuilt a coolant pump.", scope="character", scope_id=ada["id"])
        _create(server, user, "data_document", name="Food", text="Bram's stew is famous.")
        unnamed = server.post("/v1/data_document", json={"data_document": {"name": "x", "text": "y", "scope": "chat"}}, headers=_headers(user))
        assert unnamed.status_code == 422, unnamed.text
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["Where is the coolant?"]).json()["chat_message"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user)).json()["prompt"]
        system = prompt["messages"][0]["content"]
        assert "Notes that may be relevant:\nThe coolant spare is in bay two.\n\nAda once rebuilt a coolant pump." in system
        assert "stew" not in system

    def test_safety_tools_reach_the_model_and_an_x_carded_line_does_not(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        bad = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "content_rating": "spicy"}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], content_rating="teen", lines=["spiders"], veils=[" gore "]).json()["chat"]
        assert (chat["lines"], chat["veils"]) == (["spiders"], ["gore"])
        first = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I open the crate."])
        carded = _create(server, user, "chat_message", chat_id=chat["id"], parent_id=first.json()["chat_message"]["id"], role="character", speaker_character_id=ada["id"], swipes=["Something awful."])
        marked = _put(server, user, "chat_message", carded.json()["chat_message"]["id"], carded.headers["ETag"], x_carded=True)
        assert marked.status_code == 200, marked.text
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": carded.json()["chat_message"]["id"]}}, headers=_headers(user)).json()["prompt"]
        contents = [message["content"] for message in prompt["messages"]]
        assert "Never include, even off-screen: spiders." in contents[0] and "Only ever off-screen, never described: gore." in contents[0]
        assert "Something awful." not in "\n".join(contents)

    def test_the_table_gm_answers_and_a_pause_holds_the_story(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        bad = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "table_notes": [{"kind": "gossip", "text": "x"}]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], paused=True, table_notes=[{"kind": "house_rule", "text": " Crits explode. "}]).json()["chat"]
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
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        for refused in ({"dials": {"grim_hopeful": 5}}, {"pillars": {"romance": 1}}, {"structure": "spiral"}):
            answer = server.post("/v1/campaign", json={"campaign": {"name": "Bad", **refused}}, headers=_headers(user))
            assert answer.status_code == 422, (refused, answer.text)
        campaign = _create(server, user, "campaign", name="The Kestrel", premise="Smugglers on a dying freighter.", truths=[" The Guild owns every port. "]).json()["campaign"]
        assert campaign["truths"] == ["The Guild owns every port."]
        stranger = server.post("/v1/chat", json={"chat": {"title": "x", "character_ids": [ada["id"]], "campaign_id": "nope"}}, headers=_headers(user))
        assert stranger.status_code == 422, stranger.text
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], campaign_id=campaign["id"]).json()["chat"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user)).json()["prompt"]
        assert "Premise: Smugglers on a dying freighter.\nSetting truths:\n- The Guild owns every port." in prompt["messages"][0]["content"]

    def test_a_running_scenario_is_the_gms_view(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
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
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], scenario_id=scenario["id"]).json()["chat"]
        system = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user)).json()["prompt"]["messages"][0]["content"]
        assert "- The pump fails: 3/4 (close to filling); advances when a jump; when full: the ship drifts" in system
        assert "- Reyes cut it. [learned]. Clues: Cut marks (found)" in system

    def test_the_narrator_speaks_for_the_world(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada", description="{{char}} fixes engines.").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I step inside."]).json()["chat_message"]
        prompt = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"], "mode": "narrate"}}, headers=_headers(user)).json()["prompt"]
        assert prompt["messages"][0]["content"].startswith("You are the game master, narrating this story.")
        assert "- Ada: Ada fixes engines." in prompt["messages"][0]["content"]
        assert prompt["messages"][-1]["content"] == "User: I step inside."

    def test_each_role_goes_to_the_model_serving_it(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        _create(server, user, "model_endpoint", name="Summaries", base_url=model_url, model="small", roles=["summary"])
        bad = server.post("/v1/model_endpoint", json={"model_endpoint": {"name": "x", "base_url": model_url, "model": "m", "roles": ["poetry"]}}, headers=_headers(user))
        assert bad.status_code == 422, bad.text
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        line = _create(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["We dock."]).json()["chat_message"]
        RECEIVED.clear()
        server.post("/v1/ai_chat/summarize", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"], "leaf_id": line["id"]}}, headers=_headers(user))
        assert [sent["body"]["model"] for sent in RECEIVED] == ["small", "tiny"]

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

    def test_the_inspector_shows_the_prompt_without_asking_the_model(self, server: TestClient, model_url: str) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
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
        ada = _create(server, user, "character", name="Ada", description="Ada fixes engines.", example_messages="<START>").json()["character"]
        for refused in ([{"id": "nonsense", "enabled": True, "max_tokens": None}], [{"id": "main", "enabled": True, "max_tokens": None}] * 2):
            answer = server.post("/v1/generation_preset", json={"generation_preset": {"name": "Bad", "prompt_layout": refused}}, headers=_headers(user))
            assert answer.status_code == 422, answer.text
        layout = [{"id": "description", "enabled": True, "max_tokens": None}, {"id": "examples", "enabled": False, "max_tokens": None}]
        preset = _create(server, user, "generation_preset", name="Layout", prompt_layout=layout).json()["generation_preset"]
        assert preset["prompt_layout"] == layout
        _create(server, user, "model_endpoint", name="Local", base_url=model_url, model="tiny", is_default=True)
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]], preset_id=preset["id"], system_prompt="Narrate {{char}}.").json()["chat"]
        inspected = server.post("/v1/ai_chat/prompt", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user))
        assert inspected.status_code == 200, inspected.text
        assert inspected.json()["prompt"]["messages"][0]["content"] == "Ada fixes engines.\n\nNarrate Ada."

    def test_asks_for_a_model_first_and_refuses_an_unknown_chat(self, server: TestClient) -> None:
        user = create_user(server)
        ada = _create(server, user, "character", name="Ada").json()["character"]
        chat = _create(server, user, "chat", title="Chat", character_ids=[ada["id"]]).json()["chat"]
        no_model = server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": chat["id"]}}, headers=_headers(user))
        assert no_model.status_code == 409
        assert no_model.json()["detail"]["code"] == "no_model_endpoint"
        assert server.post("/v1/ai_chat/generate", json={"generate": {"chat_id": "missing"}}, headers=_headers(user)).status_code == 404
