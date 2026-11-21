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
