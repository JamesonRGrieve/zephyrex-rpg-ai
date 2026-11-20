# SPDX-License-Identifier: AGPL-3.0-or-later
"""The server's prompt assembly against the cases the client's suite runs too."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import PROMPT_CASES_PATH  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Prompt import assemble_prompt, estimate_tokens, expand_macros  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads(PROMPT_CASES_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_case(case: dict[str, Any]) -> None:
    given = case["input"]
    result = assemble_prompt(
        characters=[CASES["characters"][key] for key in given["characters"]],
        speaker_id=given["speaker_id"],
        persona=given["persona"],
        author_note=given["author_note"],
        history=given["history"],
        context_tokens=given["context_tokens"],
        max_tokens=given["max_tokens"],
        lore=given.get("lore"),
    )
    assert result.messages == case["messages"]
    assert result.dropped == case["dropped"]


def test_refuses_a_speaker_not_in_the_chat() -> None:
    with pytest.raises(ValueError, match="The speaker must be one of the chat"):
        assemble_prompt([CASES["characters"]["ada"]], "nobody", None, "", [], 8192, 400)


def test_macros_and_estimate() -> None:
    assert expand_macros("{{char}} greets {{ USER }}. <BOT> waves at <USER>.", {"char": "Ada", "user": "Sam"}) == (
        "Ada greets Sam. Ada waves at Sam."
    )
    assert estimate_tokens({"role": "user", "content": "abcdefgh"}) == 6
