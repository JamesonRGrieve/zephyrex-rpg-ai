# SPDX-License-Identifier: AGPL-3.0-or-later
"""The wiki's world entities, read through the wiki's own abilities (the composed suite: another
product is reached through its API, never its tables), under the requester's access.

- ``world_entities_page``: a campaign's entities and its setting's canon, every page.
- ``world_entities_by_id``: specific entities (a sandbox chat's persons from other campaigns), through
  ``world_entities_by_id`` when the wiki has it; none otherwise.

A reply is assembled synchronously, so an ability that answers asynchronously gives nothing.
"""

from __future__ import annotations

import inspect
from typing import Any

from fastapi import HTTPException
from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

WORLD_LORE: dict[str, Any] = CONTRACT["world_lore"]


def _sync(answer: Any) -> Any:
    if inspect.isawaitable(answer):
        close = getattr(answer, "close", None)
        if callable(close):
            close()
        return None
    return answer


def world_entities_page(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[dict[str, Any]]:
    """A campaign's entities and its setting's canon, every page; none without the wiki or a campaign."""
    if campaign_id is None:
        return []
    read = loaded_ability(model_registry, "rpg_core", "world_entities")
    if read is None:
        return []
    found: list[dict[str, Any]] = []
    after: str | None = None
    for _ in range(WORLD_LORE["max_pages"]):
        limit = WORLD_LORE["page_limit"]
        try:
            answer = read(model_registry, requester_id, campaign_id, after=after, limit=limit, include_setting=True)
            page = _sync(answer)
        except HTTPException:
            # A campaign the requester can't see, or one that's gone, holds nothing for them.
            return found
        if not isinstance(page, dict):
            return found
        found.extend(page.get("world_entities") or [])
        after = page.get("next")
        if not after:
            break
    return found


def world_entities_by_id(model_registry: Any, requester_id: str, ids: list[str]) -> list[dict[str, Any]]:
    """Specific entities the requester can see, by id; none without the wiki's ability."""
    if not ids:
        return []
    read = loaded_ability(model_registry, "rpg_core", "world_entities_by_id")
    if read is None:
        return []
    try:
        page = _sync(read(model_registry, requester_id, ids))
    except HTTPException:
        return []
    rows = page.get("world_entities") if isinstance(page, dict) else None
    return list(rows) if isinstance(rows, list) else []


def persons_for(
    model_registry: Any, requester_id: str, campaign_id: str | None, ids: list[str]
) -> list[dict[str, Any]]:
    """The world entities a chat's persons come from: its campaign's, and any of ``ids`` it doesn't hold
    read by id."""
    entities = world_entities_page(model_registry, requester_id, campaign_id)
    held = {str(entity["id"]) for entity in entities if entity.get("kind") == "person" and not entity.get("deleted")}
    missing = [id_ for id_ in dict.fromkeys(ids) if id_ not in held]
    return [*entities, *world_entities_by_id(model_registry, requester_id, missing)]


def campaign_documents(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[dict[str, Any]]:
    """A campaign's documents for the data bank (mapping item 4: journals, lore and each entry's whole
    text), through the wiki's campaign_documents ability; none without it or a campaign."""
    if campaign_id is None:
        return []
    read = loaded_ability(model_registry, "rpg_core", "campaign_documents")
    if read is None:
        return []
    try:
        rows = _sync(read(model_registry, requester_id, campaign_id))
    except HTTPException:
        return []
    if isinstance(rows, dict):
        rows = rows.get("campaign_documents")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


async def test_options(model_registry: Any, requester_id: str, person_id: str) -> dict[str, Any] | None:
    """What a test can name for a character under the campaign's system pack (the VTT's test_options),
    or None without the VTT, a pack or access: the light dice style then."""
    read = loaded_ability(model_registry, "rpg_dice", "test_options")
    if read is None:
        return None
    try:
        answer = read(requester_id, person_id)
        options = await answer if inspect.isawaitable(answer) else answer
    except HTTPException:
        return None
    return dict(options) if isinstance(options, dict) else None


async def _call(ability: Any, *args: Any, **kwargs: Any) -> Any:
    """An ability's answer, awaited when it's a coroutine; None when it refuses (an HTTPException)."""
    try:
        answer = ability(*args, **kwargs)
        return await answer if inspect.isawaitable(answer) else answer
    except HTTPException:
        return None


async def advance_clock(
    model_registry: Any, requester_id: str, campaign_id: str, minutes: int, reason: str
) -> dict[str, Any] | None:
    """The wiki campaign's clock moved on (the GM's alone): {minutes, day, time}, or None when refused."""
    advance = loaded_ability(model_registry, "rpg_core", "advance_clock")
    if advance is None:
        return None
    clock = await _call(advance, model_registry, requester_id, campaign_id, minutes, reason=reason)
    return dict(clock) if isinstance(clock, dict) and "day" in clock and "time" in clock else None


async def move_person(model_registry: Any, requester_id: str, person_id: str, location_id: str, reason: str) -> bool:
    """A person moved to a real place: by the VTT's pilot_token when it's loaded (its token follows, and it
    sets the wiki location), else by the wiki's move_person (the GM's alone). False when refused."""
    pilot = loaded_ability(model_registry, "rpg_scene", "pilot_token")
    if pilot is not None and await _call(pilot, requester_id, person_id, location_id=location_id) is not None:
        return True
    move = loaded_ability(model_registry, "rpg_core", "move_person")
    if move is None:
        return False
    return await _call(move, model_registry, requester_id, person_id, location_id, reason=reason) is not None
