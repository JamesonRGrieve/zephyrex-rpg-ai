# SPDX-License-Identifier: AGPL-3.0-or-later
"""The operator, 2026-11-22: thinking back on for story turns, shown folded under the narrator."""

from __future__ import annotations

from zephyrex.extensions.ai_chat.Thinking import (  # type: ignore[import-not-found]
    ThinkSplitter,
    thinking_fields,
    thinking_mode,
)


def _split(pieces: list[str]) -> list[tuple[str, str]]:
    splitter = ThinkSplitter()
    out: list[tuple[str, str]] = []
    for piece in pieces:
        out += splitter.take(piece)
    out += splitter.end()
    merged: list[tuple[str, str]] = []
    for kind, text in out:
        if merged and merged[-1][0] == kind:
            merged[-1] = (kind, merged[-1][1] + text)
        else:
            merged.append((kind, text))
    return merged


def test_thinking_is_split_from_the_answer_even_with_tags_cut_across_pieces() -> None:
    assert _split(["<th", "ink>The owl", "bear is hu", "ngry.</thi", "nk>The beast", " roars."]) == [
        ("think", "<think>The owlbear is hungry.</think>"),
        ("answer", "The beast roars."),
    ]


def test_an_answer_without_thinking_is_all_answer_and_a_lone_lt_is_kept() -> None:
    assert _split(["Ada says 3 <", " 4."]) == [("answer", "Ada says 3 < 4.")]


def test_a_block_left_open_is_closed_at_the_end() -> None:
    assert _split(["<think>still going"]) == [("think", "<think>still going</think>")]


def test_the_budget_counts_only_thinking() -> None:
    splitter = ThinkSplitter()
    splitter.take("A long answer. " * 1000)
    assert not splitter.over_budget()
    splitter.take("<think>" + "hmm " * 2000)
    assert splitter.over_budget()


def test_a_model_thinks_only_when_its_traits_say_it_can() -> None:
    assert thinking_mode({}) is None
    assert thinking_mode({"reasoning_effort": "none"}) == "on"
    assert thinking_mode({"reasoning_effort": "none", "thinking": False}) == "off"
    assert thinking_fields("on", "none")["reasoning_effort"] == "low"
    assert thinking_fields("on", "none")["chat_template_kwargs"] == {"enable_thinking": True}
    assert thinking_fields("off", "none") == {
        "chat_template_kwargs": {"enable_thinking": False},
        "think": False,
        "reasoning_effort": "none",
    }
    assert thinking_fields(None, None) == {}
