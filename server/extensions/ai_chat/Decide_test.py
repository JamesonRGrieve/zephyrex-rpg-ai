# SPDX-License-Identifier: AGPL-3.0-or-later
"""The decide protocol, held to contract/decide-cases.json (with the client's twin)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Decide import (  # type: ignore[import-not-found]
    batch_questions,
    decide_message,
    decide_request,
    read_answers,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "decide-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["build"], ids=lambda case: case["name"])
def test_builds_the_message(case: dict[str, Any]) -> None:
    assert decide_message(case["state"], case["questions"]) == case["message"]


@pytest.mark.parametrize("case", CASES["parse"], ids=lambda case: case["name"])
def test_reads_the_answers(case: dict[str, Any]) -> None:
    assert read_answers(case["questions"], case["content"]) == case["answers"]


@pytest.mark.parametrize("case", CASES["batch"], ids=lambda case: case["name"])
def test_batches_within_the_budget(case: dict[str, Any]) -> None:
    assert batch_questions(case["state_characters"], case["question_characters"], case["budget"]) == case["batches"]


def test_asks_for_a_json_object_with_the_message_as_the_last_user_turn() -> None:
    body = decide_request("3-5gb/d1-2b", "A tea party.", {"a": {"type": "noul", "instructions": "Rain?"}})
    assert body["response_format"] == {"type": "json_object"} and body["stream"] is False
    assert body["messages"][-1]["role"] == "user"
    assert json.loads(body["messages"][-1]["content"]) == {
        "state": "A tea party.",
        "questions": {"a": {"type": "noul", "instructions": "Rain?"}},
    }


# The real client class, taken once: each stub below wraps it, never a previous stub.
_REAL_CLIENT = httpx.AsyncClient

QUESTIONS = {"expression": {"type": "choice", "instructions": "Which feeling fits?", "criteria": ["angry", "calm"]}}


def _client_answering(monkeypatch: pytest.MonkeyPatch, respond: Any) -> list[Any]:
    """httpx clients made inside ask_decider answer through ``respond``; the requests are kept."""
    seen: list[Any] = []
    real = _REAL_CLIENT

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        result: httpx.Response = respond(request)
        return result

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    return seen


def _completion(content: str) -> Any:
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def test_ask_decider_asks_once_and_reads_only_answers_among_the_options(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from zephyrex.extensions.ai_chat.Decide import ask_decider

    choice = {"type": "choice", "choice": "angry", "probabilities": {"angry": 0.9}}
    answer = json.dumps({"answers": {"expression": choice}})
    seen = _client_answering(monkeypatch, lambda request: _completion(answer))
    answers = asyncio.run(
        ask_decider("http://gateway.test/v1/", "3-5gb/d1-2b", "k", "I will tear you apart", QUESTIONS)
    )
    assert answers == {"expression": {"choice": "angry", "probability": 0.9}}
    assert len(seen) == 1 and str(seen[0].url) == "http://gateway.test/v1/chat/completions"
    assert seen[0].headers["Authorization"] == "Bearer k"
    sent = json.loads(seen[0].content)
    assert sent["model"] == "3-5gb/d1-2b"
    assert json.loads(sent["messages"][-1]["content"])["state"] == "I will tear you apart"


def test_ask_decider_gives_none_when_refused_and_refuses_unknown_choices(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from zephyrex.extensions.ai_chat.Decide import ask_decider

    _client_answering(monkeypatch, lambda request: httpx.Response(503, text="busy"))
    assert asyncio.run(ask_decider("http://gateway.test/v1", "m", "", "x", QUESTIONS)) is None
    smug = '{"answers": {"expression": {"type": "choice", "choice": "smug"}}}'
    _client_answering(monkeypatch, lambda request: _completion(smug))
    assert asyncio.run(ask_decider("http://gateway.test/v1", "m", "", "x", QUESTIONS)) == {"expression": None}


def test_the_decision_model_gets_three_tries(monkeypatch: Any) -> None:
    # The operator, 2026-11-22: "Give the decision model 3 tries if it chokes".
    import asyncio

    from zephyrex.extensions.ai_chat import Decide  # type: ignore[import-not-found]

    answers: list[Any] = [None, {"next": None}, {"next": {"choice": "Ada"}}]
    asked: list[int] = []

    async def once(*_args: Any) -> Any:
        asked.append(1)
        return answers[len(asked) - 1]

    monkeypatch.setattr(Decide, "_ask_once", once)
    monkeypatch.setattr(Decide, "DECIDE_RETRY_SECONDS", (0.0, 0.0))
    question = {"next": {"type": "choice", "criteria": ["Ada"]}}
    got = asyncio.run(Decide.ask_decider("http://x", "m", "", "state", question))
    assert got == {"next": {"choice": "Ada"}} and len(asked) == 3
