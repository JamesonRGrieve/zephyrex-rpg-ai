# SPDX-License-Identifier: AGPL-3.0-or-later
"""A chat's cast from the wiki (the composed suite, docs/DESIGN.md): its character ids are wiki person
ids, read from the same world entities World Info reads. Persons only, in the chat's order; an id that's
no longer a person in the campaign drops out. The person the seat holds is who the person speaks as.

The twin of client/src/features/prompt/worldCast.ts, held to contract/world-cast-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_chat.PersonVoice import person_character  # type: ignore[import-not-found]


def _persons(entities: Sequence[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    return {
        str(entity["id"]): entity for entity in entities if entity.get("kind") == "person" and not entity.get("deleted")
    }


def world_cast(entities: Sequence[Mapping[str, Any]], character_ids: Sequence[str]) -> list[dict[str, Any]]:
    """The chat's cast as prompt characters, in its order."""
    persons = _persons(entities)
    return [person_character(persons[id_]) for id_ in character_ids if id_ in persons]


def seat_person(entities: Sequence[Mapping[str, Any]], seated_id: str | None) -> dict[str, str] | None:
    """The person the seat holds, as the prompt's persona; none when no one is seated."""
    person = _persons(entities).get(seated_id) if seated_id is not None else None
    if person is None:
        return None
    return {"name": str(person["name"]), "description": str(person.get("summary") or "").strip()}
