# SPDX-License-Identifier: AGPL-3.0-or-later
"""A lorebook kept in sync with the wiki (A15).

Given the book's entries and a page of the wiki's ``world_entities`` (in order), what to create,
update and remove. Each wiki entity has one entry, linked by ``wiki_entity_id``: its comment is
the entity's name, its keys the name and aliases, its content the summary. Entries the person
wrote themselves are never touched. The lite twin is client/src/features/lore/wikiSync.ts; both
run contract/wiki-sync-cases.json.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any


def entity_keys(name: str, aliases: Iterable[str]) -> list[str]:
    """The name and aliases, trimmed, empty ones dropped, each kept once in its first spelling."""
    seen: set[str] = set()
    keys: list[str] = []
    for raw in [name, *aliases]:
        key = raw.strip()
        folded = key.lower()
        if key and folded not in seen:
            seen.add(folded)
            keys.append(key)
    return keys


def _entry_text(entity: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "comment": entity["name"].strip(),
        "keys": entity_keys(entity["name"], entity.get("aliases") or []),
        "content": entity["summary"],
    }


def _same_text(entry: Mapping[str, Any], text: Mapping[str, Any]) -> bool:
    return bool(
        entry["comment"] == text["comment"]
        and entry["content"] == text["content"]
        and list(entry["keys"]) == text["keys"]
    )


def sync_plan(entries: Sequence[Mapping[str, Any]], entities: Sequence[Mapping[str, Any]]) -> dict[str, list[Any]]:
    """What to change in the book for one page of the wiki's entities."""
    # An entity listed twice changed during the sync: its last listing is the current one.
    latest: dict[str, Mapping[str, Any]] = {}
    for entity in entities:
        latest.pop(entity["id"], None)
        latest[entity["id"]] = entity
    linked: dict[str, list[Mapping[str, Any]]] = {}
    for entry in entries:
        if entry.get("wiki_entity_id") is not None:
            linked.setdefault(entry["wiki_entity_id"], []).append(entry)
    plan: dict[str, list[Any]] = {"create": [], "update": [], "remove": []}
    for entity in latest.values():
        kept, *extra = linked.get(entity["id"], [None])
        plan["remove"].extend(entry["id"] for entry in extra if entry is not None)
        if entity["deleted"]:
            if kept is not None:
                plan["remove"].append(kept["id"])
            continue
        text = _entry_text(entity)
        if kept is None:
            plan["create"].append({"wiki_entity_id": entity["id"], **text})
        elif not _same_text(kept, text):
            plan["update"].append({"id": kept["id"], **text})
    return plan
