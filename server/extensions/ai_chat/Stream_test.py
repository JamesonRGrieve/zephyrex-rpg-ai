# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reasoning a model streams apart (A45), folded into the text as lib/completionStream.ts does:
the shared stream_cases in contract/prompt-cases.json."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import PROMPT_CASES_PATH  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BLL_AI_Chat import ReasoningJoiner  # type: ignore[import-not-found]

CASES = json.loads(PROMPT_CASES_PATH.read_text())


@pytest.mark.parametrize("case", CASES["stream_cases"], ids=[case["name"] for case in CASES["stream_cases"]])
def test_stream_case(case: dict[str, Any]) -> None:
    joiner = ReasoningJoiner()
    text = "".join(joiner.take(payload) or "" for payload in case["payloads"]) + (joiner.end() or "")
    assert text == case["text"]
