# SPDX-License-Identifier: AGPL-3.0-or-later
"""The server's prompt assembly against the cases the client's suite runs too."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import PROMPT_CASES_PATH  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Prompt import background_picture_prompt, expression_prompt, pick_option, portrait_picture_prompt, scene_picture_prompt, split_reasoning, summary_prompt, table_gm_prompt, assemble_prompt, estimate_tokens, expand_macros  # type: ignore[import-not-found]

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
        mode=given.get("mode", "reply"),
        layout=given.get("layout"),
        system_prompt=given.get("system_prompt", ""),
        summary=given.get("summary", ""),
        regex=given.get("regex", []),
        objective=given.get("objective", ""),
        data_bank=given.get("data_bank", ""),
        memories=given.get("memories", ""),
        safety=given.get("safety"),
        table_notes=given.get("table_notes"),
        frame=given.get("frame"),
        scenario=given.get("scenario"),
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


@pytest.mark.parametrize("case", CASES["summary_cases"], ids=[case["name"] for case in CASES["summary_cases"]])
def test_summary_case(case: dict[str, Any]) -> None:
    given = case["input"]
    result = summary_prompt(
        [CASES["characters"][key] for key in given["characters"]], given["persona"], given["history"], given["context_tokens"], given["max_tokens"]
    )
    assert result.messages == case["messages"]
    assert result.dropped == case["dropped"]


@pytest.mark.parametrize("case", CASES["reasoning_cases"], ids=[case["name"] for case in CASES["reasoning_cases"]])
def test_reasoning_case(case: dict[str, Any]) -> None:
    assert split_reasoning(case["text"]) == (case["reasoning"], case["reply"])


@pytest.mark.parametrize("case", CASES["table_gm_cases"], ids=[case["name"] for case in CASES["table_gm_cases"]])
def test_table_gm_case(case: dict[str, Any]) -> None:
    given = case["input"]
    result = table_gm_prompt(
        [CASES["characters"][key] for key in given["characters"]],
        given["persona"],
        given["history"],
        given["context_tokens"],
        given["max_tokens"],
        given["summary"],
        given["safety"],
        given["table_notes"],
        given.get("frame"),
    )
    assert result.messages == case["messages"]
    assert result.dropped == case["dropped"]


@pytest.mark.parametrize("case", CASES["pick_cases"], ids=[case["name"] for case in CASES["pick_cases"]])
def test_pick_case(case: dict[str, Any]) -> None:
    assert pick_option(case["answer"], case["options"]) == case["picked"]


def test_expression_prompt_case() -> None:
    case = CASES["expression_prompt_case"]
    assert expression_prompt(case["line"], case["options"]) == case["messages"]


@pytest.mark.parametrize("case", CASES["portrait_cases"], ids=[case["name"] for case in CASES["portrait_cases"]])
def test_portrait_case(case: dict[str, Any]) -> None:
    assert portrait_picture_prompt(case["character"], case["asked"]) == case["prompt"]


@pytest.mark.parametrize("case", CASES["background_cases"], ids=[case["name"] for case in CASES["background_cases"]])
def test_background_case(case: dict[str, Any]) -> None:
    given = case["input"]
    characters = [CASES["characters"][key] for key in given["characters"]]
    assert background_picture_prompt(characters, given["persona"], given["history"], case["scenario"], case["asked"]) == case["prompt"]


@pytest.mark.parametrize("case", CASES["picture_cases"], ids=[case["name"] for case in CASES["picture_cases"]])
def test_picture_case(case: dict[str, Any]) -> None:
    given = case["input"]
    assert scene_picture_prompt([CASES["characters"][key] for key in given["characters"]], given["persona"], given["history"], given["asked"]) == case["prompt"]

