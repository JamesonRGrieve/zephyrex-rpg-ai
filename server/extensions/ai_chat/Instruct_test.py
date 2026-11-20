# SPDX-License-Identifier: AGPL-3.0-or-later
"""The instruct renderer against the case file the client's renderer runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Instruct import instruct_stops, render_instruct  # type: ignore[import-not-found]

CASES: list[dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "instruct-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_renders_the_shared_cases(case: dict[str, Any]) -> None:
    assert render_instruct(case["messages"], case["template"], case["open_last"]) == case["prompt"]


def test_each_template_has_its_stops() -> None:
    assert instruct_stops("chatml") == ["<|im_end|>"]
