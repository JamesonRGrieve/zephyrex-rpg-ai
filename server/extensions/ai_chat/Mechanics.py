# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dice a model wrote itself (Zephyrex RPG's live test, 2026-11-23: "Tam Quickfoot rolls Initiative:
[roll=1d20+6]"). Mechanics are never a model's (rpg-ai's rule): rolls, legal actions and outcomes come
from the VTT. invented_rolls finds the spans; the stream says mechanics_problem and the client asks again
with forbid {reason: "mechanics", note}. The twin of client/src/lib/mechanics.ts, held to
contract/mechanics-cases.json.
"""

from __future__ import annotations

import re

_PATTERNS = (
    # A roll macro: [roll=1d20+6], [roll: 2d6].
    re.compile(r"\[roll\s*[=:][^\]]*\]", re.IGNORECASE),
    # "Tam Quickfoot rolls Initiative:": someone rolling a named test, then a result.
    re.compile(r"\b[A-Z][\w'\u2019-]*(?: [A-Z][\w'\u2019-]*){0,3} rolls? (?:for )?[A-Z][\w ]{0,30}:"),
    # Dice notation outside a macro: 1d20, 2d6+3.
    re.compile(r"(?<![\w=\[])\d+d\d+(?:\s*[+-]\s*\d+)?\b"),
    # A rolled number: "rolls a 17", "rolled an 8".
    re.compile(r"\brol(?:ls|led) an? \d+\b", re.IGNORECASE),
    # A roll announced: "I'll roll for both characters - …" (live run 4, chat aa050327).
    re.compile(r"\b(?:I'll|I will|let me) roll\b[^.!?]*", re.IGNORECASE),
)
#: "Brenna gets 11": a result, but only in a reply that mentions rolling (else a price, a count).
_RESULT = re.compile(r"\b[A-Z][\w'\u2019-]* gets? (?:a )?\d+\b")


def invented_rolls(text: str) -> list[str]:
    """The spans of dice a model wrote itself, in the order the patterns find them; [] for none."""
    from zephyrex.extensions.ai_chat.Prompt import story_text  # type: ignore[import-not-found]

    answer = str(story_text(text))
    found: list[str] = []
    patterns = [*_PATTERNS, *([_RESULT] if re.search(r"\broll", answer, re.IGNORECASE) else [])]
    for pattern in patterns:
        for match in pattern.finditer(answer):
            span = match.group(0).strip()
            if span and span not in found:
                found.append(span)
    return found
