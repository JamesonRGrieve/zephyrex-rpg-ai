# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character from a wiki person (the composed suite, docs/DESIGN.md): a reply speaks as the person.
Their summary is the card's description; their voice (wiki S4c) gives the rest: personality, with how
they speak after it; the first message; and each example as SillyTavern's example block.

The twin of client/src/features/prompt/personVoice.ts, held to contract/person-voice-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

MEMORY_EXTENSION: str = CONTRACT["memory"]["extension"]


def person_character(person: Mapping[str, Any]) -> dict[str, Any]:
    voice: Mapping[str, Any] = person.get("voice") or {}
    personality = str(voice.get("personality") or "").strip()
    speech = str(voice.get("speech") or "").strip()
    examples = [str(example).strip() for example in voice.get("examples") or []]
    return {
        "id": person["id"],
        "name": person["name"],
        "description": str(person.get("summary") or "").strip(),
        "personality": "\n".join(part for part in (personality, f"Speech: {speech}" if speech else "") if part),
        "scenario": "",
        "example_messages": "\n".join(f"<START>\n{example}" for example in examples if example),
        "system_prompt": "",
        "post_history_instructions": "",
        "first_message": str(voice.get("first_message") or "").strip(),
        # Whether they remember across chats (AP8, mapping item 5), kept where the memory flag is read.
        "extensions": {MEMORY_EXTENSION: {"across_chats": True}} if voice.get("across_chats") is True else {},
    }
