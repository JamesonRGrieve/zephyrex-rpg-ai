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


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w{3,}", text.lower()))


def fact_words(fact: Mapping[str, str], line: str) -> str:
    """The fact in its record's own words: its name and the sentence nearest the line (most words shared;
    the first on a tie)."""
    sentences = [one for one in re.split(r"(?<=[.!?])\s+", fact["text"].strip()) if one.strip()] or [""]
    wanted = _words(line)
    best = max(enumerate(sentences), key=lambda pair: (len(_words(pair[1]) & wanted), -pair[0]))[1]
    return f"{fact['title']}: {best[: _CASES['quote_characters']]}"


def canon_verdict(answers: Mapping[str, Any], facts: Sequence[Mapping[str, str]], line: str = "") -> dict[str, Any]:
    """The flag from the decision model's answers: red for a flagrant break, yellow for a likely
    contradiction, else none; with the fact it picked in its record's own words. Why goes with it after
    (canon_notice)."""

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
        return {"level": "none", "fact": None, "record_name": None, "record_id": None}
    record = fact is not None and bool(fact.get("id"))
    return {
        "level": verdict,
        "fact": fact_words(fact, line) if fact is not None else None,
        "record_name": fact["title"] if record and fact is not None else None,
        "record_id": fact["id"] if record and fact is not None else None,
    }


def why_messages(speaker: str, line: str, fact: str | None) -> list[dict[str, str]]:
    """What the summary model is asked: what specifically the line gets wrong against the fact."""
    canon = fact or str(_CASES["why_setting"])
    return [
        {"role": "system", "content": str(_CASES["why_prompt"]).replace("{{fact}}", canon)},
        {"role": "user", "content": f"{speaker}: {line.strip()}"},
    ]


def read_why(answer: str) -> str | None:
    """The summary model's sentence, its thinking and quotes taken off; None for NONE or nothing."""
    from zephyrex.extensions.ai_chat.Prompt import story_text  # type: ignore[import-not-found]

    text = str(story_text(answer)).strip().strip("\"“”'").strip()
    if not text or text.upper().startswith(str(_CASES["why_none"])):
        return None
    return text[: int(_CASES["why_characters"])]


def canon_notice(verdict: Mapping[str, Any], why: str | None) -> dict[str, Any]:
    """The notice: the flag with what specifically differs, or none (never a vague warning)."""
    if verdict["level"] == "none" or why is None:
        return {"level": "none", "fact": None, "record_name": None, "record_id": None, "reason": ""}
    return {**verdict, "reason": why}
