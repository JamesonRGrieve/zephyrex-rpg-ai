# SPDX-License-Identifier: AGPL-3.0-or-later
"""The instruct renderer against the case file the client's renderer runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Instruct import (  # type: ignore[import-not-found]
    active_template,
    instruct_stops,
    render_instruct,
    render_story_string,
)

CASES: list[dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "instruct-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_renders_the_shared_cases(case: dict[str, Any]) -> None:
    assert render_instruct(case["messages"], case["template"], case["open_last"]) == case["prompt"]


def test_each_template_has_its_stops() -> None:
    assert instruct_stops("chatml") == ["<|im_end|>"]


STORIES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "instruct-cases.json").read_text())


@pytest.mark.parametrize("case", STORIES["story_cases"], ids=[case["name"] for case in STORIES["story_cases"]])
def test_renders_a_story_string(case: dict[str, Any]) -> None:
    assert render_story_string(case["story"], case["values"]) == case["text"]


@pytest.mark.parametrize("case", STORIES["active_cases"], ids=[case["name"] for case in STORIES["active_cases"]])
def test_picks_the_template_a_model_activates(case: dict[str, Any]) -> None:
    found = active_template(case["model"], case["templates"])
    assert (found["id"] if found is not None else None) == case["active"]
