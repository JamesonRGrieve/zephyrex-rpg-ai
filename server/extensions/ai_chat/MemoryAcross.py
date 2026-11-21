# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character's memory across chats (AP8), on recall by meaning (A19, Memory.py). Opt-in per
character: with its flag on, recall for that character's replies also searches the memories of the
person's other chats it was cast in (never anyone else's).

The twin of client/src/features/memory/across.ts, held to contract/memory-across-cases.json. One
pool, one budget: this chat's lines and the other chats' are scored alike (the closest first; on a
tie this chat's, then the earlier), up to ``recall`` of them within ``section_tokens``. The section
lists this chat's in story order under the prefix, then the other chats' under their own label,
whose tokens count only once one of them is kept.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Memory import MEMORY, Remembered, cosine  # type: ignore[import-not-found]

MEMORY_EXTENSION: str = MEMORY["extension"]
_CHARACTERS_PER_TOKEN: int = CONTRACT["prompt"]["characters_per_token"]


def remembers_across_chats(extensions: Mapping[str, Any] | None) -> bool:
    """Whether a character remembers across chats (off unless set, and set exactly to true)."""
    flag = (extensions or {}).get(MEMORY_EXTENSION)
    return isinstance(flag, dict) and flag.get("across_chats") is True


def with_across_chats(extensions: Mapping[str, Any] | None, on: bool) -> dict[str, Any]:
    """The extensions with the flag set; off leaves no trace."""
    rest = {key: value for key, value in (extensions or {}).items() if key != MEMORY_EXTENSION}
    return {**rest, MEMORY_EXTENSION: {"across_chats": True}} if on else rest


@dataclass(frozen=True)
class Recalled:
    here: list[str]
    elsewhere: list[str]


def _tokens(text: str) -> int:
    return math.ceil(len(text) / _CHARACTERS_PER_TOKEN)


def elsewhere_label(name: str) -> str:
    """The label over the other chats' lines, the character named."""
    return str(MEMORY["elsewhere_label"]).replace("{{char}}", name)


def recall_across(
    query: Sequence[float], here: Sequence[Remembered], elsewhere: Sequence[Remembered], name: str
) -> Recalled:
    """The closest of this chat's and the other chats' memories, within the section's budget."""
    pool = [(memory, False) for memory in here] + [(memory, True) for memory in elsewhere]
    scored = [(cosine(query, memory.vector), memory, away) for memory, away in pool]
    close = sorted(
        (entry for entry in scored if entry[0] >= MEMORY["min_similarity"]),
        key=lambda entry: (-entry[0], entry[2], entry[1].order),
    )
    kept: list[tuple[Remembered, bool]] = []
    spent = _tokens(MEMORY["prefix"])
    for _similarity, memory, away in close:
        if len(kept) == MEMORY["recall"]:
            break
        label = _tokens(elsewhere_label(name)) + 1 if away and not any(was for _kept, was in kept) else 0
        cost = _tokens(memory.text) + (1 if kept else 0) + label
        if spent + cost > MEMORY["section_tokens"]:
            continue
        kept.append((memory, away))
        spent += cost

    def in_order(away: bool) -> list[str]:
        return [memory.text for memory, was in sorted(kept, key=lambda pair: pair[0].order) if was is away]

    return Recalled(here=in_order(False), elsewhere=in_order(True))


def across_text(recalled: Recalled, name: str) -> str:
    """The prompt section: this chat's lines under the prefix, then the other chats' under their label."""
    if not recalled.here and not recalled.elsewhere:
        return ""
    parts = ["\n\n".join(recalled.here)] if recalled.here else []
    if recalled.elsewhere:
        parts.append(elsewhere_label(name) + "\n\n".join(recalled.elsewhere))
    return str(MEMORY["prefix"]) + "\n\n".join(parts)


def cast_in(chats: Sequence[Any], character_id: str, but: str) -> list[str]:
    """The ids of the person's chats, other than ``but``, whose cast includes the character."""
    return [chat.id for chat in chats if chat.id != but and character_id in (chat.character_ids or [])]
