# SPDX-License-Identifier: AGPL-3.0-or-later
"""What a scene reveals to the party (the operator's "learned facts" in the player's drawer; the wiki's
learn_fact, 60b18a2): after a round, for each PC present and each world entity the round's lines name, the
decision model says whether that PC now knows of it. It chooses only among the entities the lines name, so
no fact is invented; a "knows of" record (text None) opens the entity's GM-only record to that PC.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.MapStep import _named  # type: ignore[import-not-found]

LEARNED: dict[str, Any] = CONTRACT["learned_facts"]


def learn_questions(
    text: str, pcs: Sequence[Mapping[str, Any]], entities: Sequence[Mapping[str, Any]]
) -> tuple[dict[str, dict[str, Any]], dict[str, tuple[str, Mapping[str, Any]]]]:
    """One question per PC and entity the lines name (never a PC about themselves): whether they now know of
    it. Returns (questions keyed learn_<n>, what each key is about: (pc id, the entity)). None named, none."""
    named = [one for one in entities if one.get("name") and _named(text, one)]
    questions: dict[str, dict[str, Any]] = {}
    about: dict[str, tuple[str, Mapping[str, Any]]] = {}
    for pc in pcs:
        for entity in named:
            if str(entity["id"]) == str(pc["id"]):
                continue
            key = f"learn_{len(questions)}"
            questions[key] = {
                "type": "choice",
                "instructions": str(LEARNED["question"])
                .replace("{{pc}}", str(pc["name"]))
                .replace("{{name}}", str(entity["name"])),
                "criteria": dict(LEARNED["options"]),
            }
            about[key] = (str(pc["id"]), entity)
    return questions, about


def learned(
    answers: Mapping[str, Any] | None, about: Mapping[str, tuple[str, Mapping[str, Any]]]
) -> list[dict[str, str]]:
    """What the answers say each PC now knows of: {person_id, target_entity_type, target_entity_id}."""
    found: list[dict[str, str]] = []
    for key, (pc, entity) in about.items():
        if ((answers or {}).get(key) or {}).get("choice") == LEARNED["knows"]:
            found.append(
                {
                    "person_id": pc,
                    "target_entity_type": str(entity.get("kind") or ""),
                    "target_entity_id": str(entity["id"]),
                }
            )
    return found
