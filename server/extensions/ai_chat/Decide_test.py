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
        found = answers[len(asked) - 1]
        return found, None if found is not None else {"kind": "http", "detail": "HTTP 500"}

    monkeypatch.setattr(Decide, "_ask_once", once)
    monkeypatch.setattr(Decide, "DECIDE_RETRY_SECONDS", (0.0, 0.0))
    question = {"next": {"type": "choice", "criteria": ["Ada"]}}
    got = asyncio.run(Decide.ask_decider("http://x", "m", "", "state", question))
    assert got == {"next": {"choice": "Ada"}} and len(asked) == 3


def test_a_timeout_is_said_and_a_turns_own_decision_waits_once_more(monkeypatch: Any) -> None:
    # Zephyrex RPG's live fault, 2026-11-23: a busy decision model's timeouts were kept as silent nulls, and
    # each was tried twice more, lengthening its queue. r46: a departure's scene move timed out twice at 20 s.
    import asyncio

    from zephyrex.extensions.ai_chat import Decide

    waits: list[float] = []

    async def once(*args: Any) -> Any:
        waits.append(args[7] if len(args) > 7 else 1.0)
        return None, {"kind": "timeout", "detail": "no answer in 12 s (1 questions)"}

    monkeypatch.setattr(Decide, "_ask_once", once)
    question = {"next": {"type": "choice", "criteria": ["Ada"]}}
    got = asyncio.run(Decide.ask_decider_detailed("http://x", "m", "", "state", question))
    assert got == (None, {"kind": "timeout", "detail": "no answer in 12 s (1 questions)"}) and waits == [1.0, 2.0]
    waits.clear()
    asyncio.run(Decide.ask_decider_detailed("http://x", "m", "", "state", question, None, True))
    assert waits == [1.0]  # background work isn't asked again
    sized = Decide.DECIDE_TIMEOUT_SECONDS + 2 * Decide.DECIDE_SECONDS_PER_QUESTION
    assert Decide.decide_timeout({"a": 1, "b": 2}) == sized


def test_identical_requests_in_flight_are_asked_once(monkeypatch: Any) -> None:
    import asyncio

    from zephyrex.extensions.ai_chat import Decide

    asked: list[int] = []

    async def once(*_args: Any) -> Any:
        asked.append(1)
        await asyncio.sleep(0.01)
        return {"next": {"choice": "Ada"}}, None

    monkeypatch.setattr(Decide, "_ask_once", once)
    question = {"next": {"type": "choice", "criteria": ["Ada"]}}

    async def both() -> list[Any]:
        return list(
            await asyncio.gather(
                Decide.ask_decider("http://x", "m", "", "state", question),
                Decide.ask_decider("http://x", "m", "", "state", question),
            )
        )

    assert asyncio.run(both()) == [{"next": {"choice": "Ada"}}] * 2 and len(asked) == 1


def test_background_work_keeps_to_its_share_of_the_slots(monkeypatch: Any) -> None:
    # Zephyrex RPG's live run, chat 3a9a44cd: label calls held every slot and the fight checks timed out.
    import asyncio

    from zephyrex.extensions.ai_chat import Decide

    busy = {"now": 0, "most": 0}

    async def run() -> int:
        gate = asyncio.Event()

        class Client:
            def __init__(self, **_kwargs: Any) -> None:
                pass

            async def __aenter__(self) -> Client:
                return self

            async def __aexit__(self, *_exc: Any) -> None:
                return None

            async def post(self, *_args: Any, **_kwargs: Any) -> Any:
                busy["now"] += 1
                busy["most"] = max(busy["most"], busy["now"])
                await gate.wait()
                busy["now"] -= 1
                return httpx.Response(503, text="busy")

        monkeypatch.setattr(httpx, "AsyncClient", Client)
        question = {"next": {"type": "choice", "instructions": "Who speaks?", "criteria": ["Ada"]}}
        labels = [
            asyncio.ensure_future(Decide._ask_once("http://x", "m", "", f"s{n}", question, None, True))
            for n in range(4)
        ]
        await asyncio.sleep(0.05)
        held = busy["most"]
        gate.set()
        await asyncio.gather(*labels)
        return held

    assert asyncio.run(run()) == Decide.DECIDE_BACKGROUND_IN_FLIGHT


def test_every_option_offered_is_scored_for_the_record() -> None:
    # The operator, 2026-11-24: "I don't see the available options and their individual scores".
    from zephyrex.extensions.ai_chat.Decide import answer_scores

    questions = {
        "next": {"type": "choice", "instructions": "Who?", "criteria": ["Ada", "Bram"]},
        "how": {"type": "noul", "instructions": "How sure?"},
    }
    content = json.dumps(
        {
            "answers": {
                "next": {"type": "choice", "choice": "Ada", "probabilities": {"Ada": 0.7, "Bram": 0.3, "Cy": 0.1}},
                "how": {"type": "noul", "noul": 0.4},
            }
        }
    )
    assert answer_scores(questions, content) == {"next": {"Ada": 0.7, "Bram": 0.3}}
    assert answer_scores(questions, "not json") == {}


def test_background_work_waits_while_a_turns_decision_is_in_flight(monkeypatch: Any) -> None:
    # Zephyrex RPG's live chat 64e11be8: a round's scene step took about 40 s while line labels ran.
    import asyncio

    from zephyrex.extensions.ai_chat import Decide

    order: list[str] = []

    async def post(*args: Any) -> Any:
        order.append(str(args[4]))
        await asyncio.sleep(0.02)
        order.append(f"{args[4]} done")
        return {"next": {"choice": "Ada"}}, None, {}, args[-1]

    monkeypatch.setattr(Decide, "_post", post)
    question = {"next": {"type": "choice", "instructions": "Who?", "criteria": ["Ada"]}}

    async def both() -> Any:
        turn = asyncio.ensure_future(Decide._ask_once("http://x", "m", "", "turn", question, None, False))
        await asyncio.sleep(0)
        label = asyncio.ensure_future(Decide._ask_once("http://x", "m", "", "label", question, None, True))
        return await asyncio.gather(turn, label)

    turn, label = asyncio.run(both())
    assert order == ["turn", "turn done", "label", "label done"]
    assert label[3] >= turn[3]  # the label waited (queued_ms), the turn's decision didn't
