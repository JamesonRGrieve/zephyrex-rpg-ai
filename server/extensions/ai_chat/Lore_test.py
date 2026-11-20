# SPDX-License-Identifier: AGPL-3.0-or-later
"""The server's World Info activation against the cases the client's suite runs too."""

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Lore import activate_lore, lore_tokens  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "lore-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_case(case: dict[str, Any]) -> None:
    draws = iter(case["rolls"])
    result = activate_lore(
        [{**CASES["defaults"], **entry} for entry in case["entries"]],
        case["history"],
        case["message_count"],
        case["speaker"],
        case["state"],
        {**CASES["settings"], **case.get("settings", {})},
        lambda: next(draws),
    )
    assert {"active": result.active, "sections": result.sections, "at_depth": result.at_depth, "state": result.state} == case["expect"]


def test_a_broken_regex_key_matches_nothing() -> None:
    entry = {**CASES["defaults"], "id": "x", "keys": ["/([/i"], "content": "never"}
    result = activate_lore([entry], ["anything"], 1, "Ada", {}, CASES["settings"], lambda: 0.0)
    assert result.active == []
    assert lore_tokens("abcdefgh") == 2
