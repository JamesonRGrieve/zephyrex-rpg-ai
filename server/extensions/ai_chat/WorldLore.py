# SPDX-License-Identifier: AGPL-3.0-or-later
"""World Info over the wiki (the composed suite, docs/DESIGN.md): the wiki's world entities as the lore
entries Lore.py's activation reads, so SillyTavern's activation runs over wiki records.

The twin of client/src/features/lore/worldLore.ts, held to contract/world-lore-cases.json: keys are an
entity's name, aliases and keywords; content its summary; its lore block (wiki S4d) sets the rest, else
the wiki's lore defaults. Deleted entities, entities with nothing to say, and ``outlet`` entries are
left out.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

WORLD_LORE: dict[str, Any] = CONTRACT["world_lore"]
DEFAULTS: dict[str, Any] = WORLD_LORE["lore_defaults"]
POSITIONS: dict[str, str] = WORLD_LORE["positions"]
LOGICS = ("and_any", "not_all", "not_any", "and_all")


def world_keys(name: str, aliases: Iterable[str] = (), keywords: Iterable[str] = ()) -> list[str]:
    """The name, aliases and keywords, trimmed, empty ones dropped, each kept once in its first spelling."""
    seen: set[str] = set()
    keys: list[str] = []
    for raw in [name, *aliases, *keywords]:
        key = raw.strip()
        if key and key.lower() not in seen:
            seen.add(key.lower())
            keys.append(key)
    return keys


def _number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def world_lore_entry(entity: Mapping[str, Any]) -> dict[str, Any] | None:
    """The lore entry an entity is, or None when it's left out."""
    summary = str(entity.get("summary") or "").strip()
    if entity.get("deleted") or not summary:
        return None
    lore: Mapping[str, Any] = entity.get("lore") or {}
    # An outlet entry goes only where an {{outlet}} macro puts it, which this app doesn't have yet.
    if lore.get("position") == "outlet":
        return None

    def pick(key: str, ok: Any) -> Any:
        return lore[key] if key in lore and ok(lore[key]) else DEFAULTS[key]

    position = pick("position", lambda value: isinstance(value, str) and value in POSITIONS)
    mapped = POSITIONS.get(position)
    if mapped is None:
        return None
    return {
        "id": entity["id"],
        "keys": world_keys(entity["name"], entity.get("aliases") or [], entity.get("keywords") or []),
        "secondary_keys": list(
            pick("secondary_keys", lambda value: isinstance(value, list) and all(isinstance(k, str) for k in value))
        ),
        "selective_logic": pick("selective_logic", lambda value: value in LOGICS),
        "content": summary,
        "enabled": True,
        "constant": pick("always_active", lambda value: isinstance(value, bool)),
        "position": mapped,
        "depth": pick("depth", _number),
        "role": "system",
        "order": pick("order", _number),
        "probability": pick("probability", _number),
        "group": pick("group", lambda value: isinstance(value, str)),
        "group_weight": pick("group_weight", _number),
        "prioritize": False,
        "sticky": pick("sticky", _number),
        "cooldown": pick("cooldown", _number),
        "delay": pick("delay", _number),
        "exclude_recursion": False,
        "prevent_recursion": False,
        "delay_until_recursion": False,
        "case_sensitive": None,
        "match_whole_words": None,
        "character_names": [],
        "character_exclude": False,
    }


def world_lore_entries(entities: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Every entity's lore entry, in the wiki's order, those left out dropped."""
    return [entry for entry in (world_lore_entry(entity) for entity in entities) if entry is not None]


def wiki_campaign_of(campaign_id: str | None, frames: Mapping[str, str | None]) -> str | None:
    """A chat's wiki campaign: its campaign_id, or, while campaign frames remain, the wiki campaign of
    the frame it names. Remove with the frames."""
    if campaign_id is None:
        return None
    return frames.get(campaign_id) if campaign_id in frames else campaign_id


def canon_in_reach(entities: Sequence[Mapping[str, Any]], text: str) -> list[Mapping[str, Any]]:
    """The campaign's own entities, and of a setting's canon only those whose name or an alias the text
    says word for word (the operator, 2026-11-22: "Why is it reading the whole world instead of
    tag/relevance based injection?"; the 5e SRD's 2,287 records were scanned every prompt)."""
    said = " " + " ".join(re.findall(r"[^\W_]+", text.lower())) + " "

    def named(entity: Mapping[str, Any]) -> bool:
        names = [str(entity.get("name") or ""), *(str(alias) for alias in entity.get("aliases") or [])]
        words = (" ".join(re.findall(r"[^\W_]+", name.lower())) for name in names)
        return any(word and f" {word} " in said for word in words)

    return [entity for entity in entities if not entity.get("canon") or named(entity)]
