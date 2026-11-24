# SPDX-License-Identifier: AGPL-3.0-or-later
"""What produced a line, kept for review (the operator, 2026-11-23): decision calls under the message,
the reply's request as sent, and feedback with both."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions.ai_chat import BLL_AI_Chat  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def _make(server: TestClient, user: Any, resource: str, **fields: Any) -> dict[str, Any]:
    made = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(user))
    assert made.status_code == 201, made.text
    return dict(made.json()[resource])


def test_decision_calls_are_kept_under_the_message_and_feedback_snapshots_them(
    server: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = create_user(server)  # type: ignore[no-untyped-call]
    for name in ("Judge A", "Judge B"):
        _make(server, user, "model_endpoint", name=name, base_url="http://127.0.0.1:9/v1", model=name, roles=["decide"])
    world = _make(server, user, "campaign", name="Inn")["id"]
    ada = _make(server, user, "person", name="Ada", kind="npc", campaign_id=world)
    chat = _make(server, user, "chat", title="Inn", character_ids=[ada["id"]])
    line = _make(server, user, "chat_message", chat_id=chat["id"], role="user", swipes=["I wait."])
    asked: list[tuple[str, list[str]]] = []

    running: list[str] = []

    async def decide(
        _url: str, model: str, _key: str, _state: str, questions: dict[str, Any], *rest: Any
    ) -> tuple[dict[str, Any], None]:
        asked.append((model, list(questions)))
        heard = rest[2] if len(rest) > 2 else None
        if model == "Judge A" and heard is not None:
            # A first try that timed out, then its retry: two records (the operator, 2026-11-24).
            await heard({"phase": "start", "attempt": 1})
            listed = server.get(f"/v1/decision_call?chat_id={chat['id']}", headers=_headers(user)).json()
            running.extend(call["status"] for call in listed["decision_calls"])
            await heard({"phase": "end", "attempt": 1, "answers": None, "error": {"kind": "timeout", "detail": "x"}})
        found = {key: {"choice": "yes"} for key in questions}
        if heard is not None:
            await heard({"phase": "start", "attempt": 2 if model == "Judge A" else 1})
            scores = {key: {"yes": 0.8, "no": 0.2} for key in questions}
            attempt = 2 if model == "Judge A" else 1
            end = {"phase": "end", "attempt": attempt, "answers": found, "ms": 5, "scores": scores}
            await heard(end)
        return found, None

    monkeypatch.setattr(BLL_AI_Chat, "ask_decider_detailed", decide)

    class Asked:
        chat_id = chat["id"]
        leaf_id = line["id"]

    registry = server.app.state.model_registry  # type: ignore[attr-defined]
    manager = BLL_AI_Chat.AIChatManager(requester_id=str(user.id), model_registry=registry)
    import asyncio

    questions = {
        key: {"type": "choice", "instructions": f"{key}?", "criteria": ["yes", "no"]} for key in ("a", "b", "c")
    }
    answers = asyncio.run(manager._decide("needs_roll", Asked(), "The tavern.", questions))
    assert answers == {"a": {"choice": "yes"}, "b": {"choice": "yes"}, "c": {"choice": "yes"}}
    # Spread across both decision models, in parallel.
    assert sorted(model for model, _keys in asked) == ["Judge A", "Judge B"]
    assert sorted(key for _model, keys in asked for key in keys) == ["a", "b", "c"]
    calls = server.get(f"/v1/decision_call?chat_id={chat['id']}", headers=_headers(user)).json()["decision_calls"]
    # Each try its own record: Judge A's failed first try, its retry, and Judge B's one.
    assert len(calls) == 3 and {call["message_id"] for call in calls} == {line["id"]}
    assert all(call["purpose"] == "needs_roll" and call["state"] == "The tavern." for call in calls)
    assert sorted((call["status"], call["attempt"]) for call in calls) == [("done", 1), ("done", 2), ("failed", 1)]
    failed = next(call for call in calls if call["status"] == "failed")
    assert failed["error"] == {"kind": "timeout", "detail": "x"}
    assert "running" in running  # kept while it ran
    # Each option offered, and its score (the operator, 2026-11-24).
    done = next(call for call in calls if call["status"] == "done")
    assert all(question["options"] == ["yes", "no"] for question in done["questions"])
    assert all(answer["scores"] == {"yes": 0.8, "no": 0.2} for answer in done["answers"].values())

    reply = _make(
        server, user, "chat_message", chat_id=chat["id"], parent_id=line["id"], role="narrator", swipes=["Rain."]
    )
    sent = {"messages": [{"role": "user", "content": "I wait."}]}
    snapshot_of = {"chat_id": chat["id"], "leaf_id": line["id"], "mode": "narrate", "model": "m", "request": sent}
    _make(server, user, "generation_snapshot", **snapshot_of)
    feedback = _make(server, user, "message_feedback", message_id=reply["id"], verdict="bad", note="It ignored me.")
    assert feedback["chat_id"] == chat["id"]
    snapshot = feedback["snapshot"]
    assert snapshot["text"] == "Rain." and snapshot["request"]["messages"][0]["content"] == "I wait."
    assert len(snapshot["decisions"]) == 3
    # The snapshot and chat are the manager's: a caller's own are never kept (trusted_fields).
    forged = {"message_feedback": {"message_id": reply["id"], "verdict": "good", "snapshot": {"text": "forged"}}}
    kept = server.post("/v1/message_feedback", json=forged, headers=_headers(user))
    assert kept.status_code in (201, 422), kept.text
    if kept.status_code == 201:
        assert kept.json()["message_feedback"]["snapshot"]["text"] == "Rain."
    feedback_url = f"/v1/message_feedback?chat_id={chat['id']}"
    listed = server.get(feedback_url, headers=_headers(user)).json()["message_feedbacks"]
    assert listed[0]["verdict"] == "bad"
    other = create_user(server)  # type: ignore[no-untyped-call]
    other_asks = {"message_feedback": {"message_id": reply["id"], "verdict": "good"}}
    refused = server.post("/v1/message_feedback", json=other_asks, headers=_headers(other))
    assert refused.status_code == 422, refused.text
