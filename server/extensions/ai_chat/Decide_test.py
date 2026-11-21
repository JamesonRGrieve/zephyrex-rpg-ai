# SPDX-License-Identifier: AGPL-3.0-or-later
"""The decide protocol, held to contract/decide-cases.json (with the client's twin)."""

from __future__ import annotations

import json
from typing import Any

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
