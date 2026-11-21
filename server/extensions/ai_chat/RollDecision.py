# SPDX-License-Identifier: AGPL-3.0-or-later
"""Whether a character's action needs a roll, and which (the operator, 2026-11-21; DESIGN's needs_roll):
a choice among the campaign's system pack's options (the VTT's test_options for the acting character)
or, without a pack or a sheet, the light dice style.

The twin of client/src/features/chat/rollDecision.ts, held to contract/roll-decision-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

DECIDE_ROLL: dict[str, Any] = CONTRACT["decide_roll"]


def roll_questions(
    options: Mapping[str, Any] | None, mode: str, actor: str
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]]]:
    """The decision model's questions (the roll, and a difficulty under a pack), and what each option picks."""
    instructions = DECIDE_ROLL["instructions"]["mechanical" if mode == "mechanical" else "narrative"].replace(
        "{{actor}}", actor
    )
    picks: dict[str, dict[str, str]] = {DECIDE_ROLL["none"]: {"kind": "none"}}
    if options is None or not options.get("has_sheet"):
        picks[DECIDE_ROLL["light"]["option"]] = {"kind": "formula"}
        return {"roll": {"type": "choice", "instructions": instructions, "criteria": list(picks)}}, picks
    for option in [*options["characteristics"], *options["skills"]]:
        if option["name"] not in picks:
            picks[option["name"]] = {"kind": "test", "name": option["slug"], "label": option["name"]}
    questions = {
        "roll": {"type": "choice", "instructions": instructions, "criteria": list(picks)},
        "difficulty": {
            "type": "choice",
            "instructions": DECIDE_ROLL["difficulty"],
            "criteria": [difficulty["slug"] for difficulty in options["difficulties"]],
        },
    }
    return questions, picks


def roll_pick(
    answers: Mapping[str, Any] | None, picks: Mapping[str, Mapping[str, str]], options: Mapping[str, Any] | None
) -> dict[str, str] | None:
    """What the answers pick, or None when the roll question named no option."""
    answer = (answers or {}).get("roll")
    if not isinstance(answer, Mapping) or "choice" not in answer:
        return None
    option = picks.get(str(answer["choice"]))
    if option is None:
        return None
    if option["kind"] == "none":
        return {"kind": "none"}
    if option["kind"] == "formula":
        formula = str(DECIDE_ROLL["light"]["formula"])
        return {"kind": "formula", "formula": formula, "label": formula}
    asked = (answers or {}).get("difficulty")
    slugs = [difficulty["slug"] for difficulty in (options or {}).get("difficulties", [])]
    if isinstance(asked, Mapping) and asked.get("choice") in slugs:
        difficulty = str(asked["choice"])
    else:
        difficulty = str((options or {}).get("default_difficulty") or "")
    label = f"{option['label']} ({difficulty})"
    return {"kind": "test", "name": option["name"], "difficulty": difficulty, "label": label}


def light_outcome(total: int) -> str:
    """The light dice style's outcome for a total."""
    return next((str(band["outcome"]) for band in DECIDE_ROLL["light"]["bands"] if total >= band["at_least"]), "")
