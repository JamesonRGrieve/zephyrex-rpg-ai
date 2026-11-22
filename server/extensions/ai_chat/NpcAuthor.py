# SPDX-License-Identifier: AGPL-3.0-or-later
"""The figures a person's line addresses or approaches who aren't people yet (the operator, 2026-11-22):
a say line's target no person matches, and the phrase after an approach cue. Free; none means no model call.

The twin of client/src/features/chat/npcAuthor.ts, held to contract/npc-author-cases.json.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PlayerLines import parse_player_lines  # type: ignore[import-not-found]

NPC_AUTHOR: dict[str, Any] = CONTRACT["npc_author"]
_WORD = r"[^\W\d_][\w'-]*"


def _bare(name: str) -> str:
    return re.sub(r"^(?:the|a|an)\s+", "", name.strip().lower())


def _figure(phrase: str, place: str = "") -> dict[str, str] | None:
    words = _bare(phrase).split()
    while words and words[-1] in NPC_AUTHOR["stop_words"]:
        words.pop()
    if not words:
        return None
    role = " ".join(words)
    name = "The " + " ".join(word[:1].upper() + word[1:] for word in words)
    return {"phrase": f"the {role}{place}", "name": name, "role": role}


def npc_figures(line: str, people: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    """The figures the line addresses or approaches who aren't people yet: {phrase, name, role}."""
    present = {_bare(str(person["name"])) for person in people}
    found: list[dict[str, str]] = []

    def keep(one: dict[str, str] | None) -> None:
        if one is None or one["role"] in present or any(other["role"] == one["role"] for other in found):
            return
        found.append(one)

    cues = "|".join(re.sub(r" ", r"\\s+", cue) for cue in sorted(NPC_AUTHOR["cues"], key=len, reverse=True))
    places = "|".join(NPC_AUTHOR["places"])
    ends = "|".join([*NPC_AUTHOR["places"], *NPC_AUTHOR["stop_words"]])
    # The noun is one or two words, never a place word or a stop word; a place after it belongs to the phrase.
    pattern = re.compile(
        rf"\b(?:{cues})\s+(?:the|a|an)\s+({_WORD}(?:\s+(?!(?:{ends})\b){_WORD})?)((?:\s+(?:{places})\s+the\s+{_WORD})?)",
        re.IGNORECASE,
    )
    for item in parse_player_lines(line, people):
        if item["kind"] == "say" and item["target_id"] is None and item["target_name"] is not None:
            keep(_figure(str(item["target_name"])))
        if item["kind"] == "say":
            continue
        for match in pattern.finditer(str(item["text"])):
            keep(_figure(match.group(1).lower(), re.sub(r"\s+", " ", match.group(2).lower())))
    return found


def npc_writing(text: str) -> dict[str, str]:
    """The summary model's answer as the new person's fields (summary, description, personality, motive,
    voice), each "" where it said nothing; a plain answer is the summary."""
    start, end = text.find("{"), text.rfind("}")
    try:
        parsed = json.loads(text[start : end + 1]) if start != -1 and end > start else None
    except ValueError:
        parsed = None
    keys = ("summary", "description", "personality", "motive", "voice")
    if not isinstance(parsed, dict):
        return {key: (text.strip() if key == "summary" else "") for key in keys}
    return {key: str(parsed.get(key) or "").strip() for key in keys}


def npc_entry(fields: Mapping[str, str]) -> str:
    """The new person's wiki entry: their description, then their personality and motive as sections."""
    parts = [fields.get("description", "")]
    if fields.get("personality"):
        parts.append(f"## Personality\n\n{fields['personality']}")
    if fields.get("motive"):
        parts.append(f"## What they want\n\n{fields['motive']}")
    return "\n\n".join(part for part in parts if part)
