# SPDX-License-Identifier: AGPL-3.0-or-later
"""The GM's question tool (the operator, 2026-11-21): when the person's do line leaves its target ambiguous,
the GM asks, out of game, the options only those present. Free first, then one decide call.

The twin of client/src/features/chat/clarify.ts, held to contract/clarify-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

CLARIFY: dict[str, Any] = CONTRACT["clarify"]


def clarify_need(
    items: Sequence[Mapping[str, Any]], seat_id: str | None, candidates: Sequence[Mapping[str, Any]]
) -> dict[str, str] | None:
    """The person's do line that may need a question: theirs, with no target, among two or more."""
    if len(candidates) < 2 or seat_id is None:
        return None
    # A line that names a thing or a place ("on the hearth", "into the fire") has its target.
    named = re.compile(
        rf"\b(?:{'|'.join(CLARIFY['object_prepositions'])})\s+(?:{'|'.join(CLARIFY['object_determiners'])})\s+[^\W\d_][\w'-]*",
        re.IGNORECASE,
    )
    for item in items:
        if (
            item["kind"] == "do"
            and item["speaker_id"] == seat_id
            and item["target_id"] is None
            and item.get("target_name") is None
            and not named.search(str(item["text"]))
        ):
            return {"action": str(item["text"])}
    return None


def clarify_questions(action: str, actor: str, candidates: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """The decide question (is it ambiguous?) and the player's question with its options."""

    def fill(text: str) -> str:
        names = ", ".join(str(one["name"]) for one in candidates)
        return text.replace("{{actor}}", actor).replace("{{action}}", action).replace("{{candidates}}", names)

    return {
        "decide": {"type": "noul", "instructions": fill(CLARIFY["ambiguous"])},
        "player": {
            "question": fill(CLARIFY["question"]),
            "options": [{"label": str(one["name"]), "value": str(one["id"])} for one in candidates],
        },
    }


def should_ask(answer: Mapping[str, Any] | None) -> bool:
    """Whether the decide answer says ask: its probability at or over the threshold."""
    return (
        isinstance(answer, Mapping)
        and isinstance(answer.get("probability"), (int, float))
        and float(answer["probability"]) >= float(CLARIFY["threshold"])
    )
