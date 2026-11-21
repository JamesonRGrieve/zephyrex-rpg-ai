# SPDX-License-Identifier: AGPL-3.0-or-later
"""Which persona a chat speaks as (audit gap 9), as SillyTavern picks it: the one chosen for the chat;
else one locked to a character in the chat (the first of its characters that has one, then the
persona's name for a tie); else the default persona; else none.

The twin of client/src/features/prompt/personaPick.ts, held to contract/persona-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def persona_for(chosen_id: str | None, character_ids: Sequence[str], personas: Sequence[Any]) -> Any | None:
    """``personas`` are mappings or records with id, name, is_default and character_ids."""

    def field(persona: Any, name: str) -> Any:
        return persona.get(name) if isinstance(persona, Mapping) else getattr(persona, name, None)

    if chosen_id is not None:
        for persona in personas:
            if field(persona, "id") == chosen_id:
                return persona
    by_name = sorted(personas, key=lambda persona: (str(field(persona, "name")), str(field(persona, "id"))))
    for character_id in character_ids:
        for persona in by_name:
            if character_id in (field(persona, "character_ids") or []):
                return persona
    return next((persona for persona in by_name if field(persona, "is_default")), None)


def persona_books(persona: Any | None, books: Sequence[str]) -> list[str]:
    """The lorebooks a persona brings to the chat's own (its lorebook, once)."""
    own = None
    if persona is not None:
        own = persona.get("lorebook_id") if isinstance(persona, Mapping) else getattr(persona, "lorebook_id", None)
    return list(books) if own is None or own in books else [*books, own]
