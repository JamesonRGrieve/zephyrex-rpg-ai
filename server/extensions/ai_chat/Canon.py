# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canon warnings (docs/DESIGN.md, Canon warnings; the operator, 2026-11-21).

A line is checked against the canon in reach by the decision model: yellow when it likely
contravenes established canon, red when it flagrantly breaks in-universe canon. The twin of
client/src/features/chat/canon.ts, held to contract/canon-cases.json.
"""

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "canon-cases.json").read_text())
NONE: str = _CASES["none_option"]


def canon_state(speaker: str, line: str, facts: Sequence[Mapping[str, str]]) -> str:
    """The scene the decision model reads: the canon in reach, numbered, then who speaks and the line."""
    listed = "\n".join(
        f"{index + 1}. {fact['title']}: {fact['text'].strip()[: _CASES['fact_characters']]}"
        for index, fact in enumerate(facts[: _CASES["max_facts"]])
    )
    canon = f"{_CASES['setting_heading']}\n{listed or _CASES['no_facts']}"
    return f"{canon}\n\n{_CASES['line_heading']}\n{speaker}: {line.strip()}"


def canon_questions(facts: Sequence[Mapping[str, str]]) -> dict[str, dict[str, Any]]:
    """The questions: established canon, in-universe canon, and which fact it conflicts with."""
    titles = list(dict.fromkeys(fact["title"] for fact in facts[: _CASES["max_facts"]]))
    questions = _CASES["questions"]
    return {
        "established": {
            "type": "score",
            "instructions": questions["established"],
            "criteria": _CASES["established_levels"],
        },
        "universe": {"type": "score", "instructions": questions["universe"], "criteria": _CASES["universe_levels"]},
        "fact": {"type": "choice", "instructions": questions["fact"], "criteria": [*titles, NONE]},
    }


def canon_verdict(answers: Mapping[str, Any], facts: Sequence[Mapping[str, str]]) -> dict[str, Any]:
    """The notice from the answers: red for a flagrant break, yellow for a likely contradiction, else none."""

    def level(key: str) -> int:
        answer = answers.get(key)
        return int(answer["index"]) if isinstance(answer, Mapping) and "index" in answer else 0

    chosen = answers.get("fact")
    title = chosen["choice"] if isinstance(chosen, Mapping) and chosen.get("choice") not in (None, NONE) else None
    fact = next((one for one in facts if one["title"] == title), None) if title is not None else None
    if level("universe") >= _CASES["red_at_universe"]:
        verdict = "red"
    elif level("established") >= _CASES["yellow_at_established"] or level("universe") >= _CASES["yellow_at_universe"]:
        verdict = "yellow"
    else:
        return {"level": "none", "fact": None, "reason": ""}
    quoted = ""
    if fact is not None:
        first = re.split(r"(?<=[.!?])\s", fact["text"].strip())[0][: _CASES["quote_characters"]]
        quoted = f" {fact['title']}: “{first}”"
    reason = _CASES["red_reason"] if verdict == "red" else _CASES["yellow_reason"]
    return {"level": verdict, "fact": fact["title"] if fact is not None else None, "reason": reason + quoted}
