# SPDX-License-Identifier: AGPL-3.0-or-later
"""Every action an action line, present tense, against contract/action-cases.json (the operator,
2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING ACTIONS?"), in both multi-actor modes."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.ActionLines import action_lines, present  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "action-cases.json").read_text())


def _shape(runs: list[dict[str, Any]]) -> list[list[Any]]:
    return [
        [run["speaker_id"], [line["kind"] for line in run["lines"]], [line["text"] for line in run["lines"]]]
        for run in runs
    ]


def test_a_past_verb_is_put_in_the_present() -> None:
    assert {verb: present(verb) for verb in CASES["tenses"]} == CASES["tenses"]


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_every_action_is_an_action_line(case: dict[str, Any]) -> None:
    runs, wrong = action_lines(case["runs"], CASES["people"])
    assert _shape(runs) == case["runs_out"]
    assert wrong == case["wrong"]
    # Multi-actor off: a narration keeps only the narrator's own lines (the action is cut, never narration).
    solo = [run for run in runs if run["speaker_id"] is None]
    assert _shape(solo) == case["solo"]
