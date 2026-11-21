# SPDX-License-Identifier: AGPL-3.0-or-later
"""SillyTavern's macros (audit gap 1) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Macros import MacroContext, expand_all, expand_macros  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "macro-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_fills_the_macros_as_the_lite_twin_does(case: dict[str, Any]) -> None:
    given = case["context"]
    draws = iter(given.get("random") or [])
    context = MacroContext(
        names=given["names"],
        group=given.get("group", ""),
        not_char=given.get("not_char"),
        fields=given.get("fields", {}),
        chat=given.get("chat", {}),
        now=given.get("now"),
        random=(lambda: next(draws)) if "random" in given else None,
        local=given.get("local", {}),
        global_=given.get("global", {}),
    )
    result = expand_all(case["text"], context)
    assert result.text == case["text_out"]
    if case["local_out"] is not None:
        assert result.local == case["local_out"]
    if case["global_out"] is not None:
        assert result.global_ == case["global_out"]


def test_names_only_leaves_what_needs_a_context() -> None:
    assert expand_macros("{{char}} greets {{user}}. {{random:a,b}}", {"char": "Ada", "user": "Sam"}) == (
        "Ada greets Sam. {{random:a,b}}"
    )
