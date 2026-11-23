# SPDX-License-Identifier: AGPL-3.0-or-later
"""Structure without trusting the narrator (the operator, 2026-11-23; contract reformat): the narrator's
finished prose rewritten by a small model as items whose speaker and target can only be someone present,
so who says and who does is a constrained model's call, never a pattern's.

The items are the structured turn's (Structured.py), read into runs by its structured_runs.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Structured import STRUCTURED, turn_schema  # type: ignore[import-not-found]

REFORMAT: dict[str, Any] = CONTRACT["reformat"]


def reformat_schema(names: Sequence[str]) -> dict[str, Any]:
    """The structured turn's schema with speaker and target limited to the people present (or null)."""
    schema: dict[str, Any] = turn_schema()
    item = schema["properties"]["items"]["items"]
    who: dict[str, Any] = {"type": ["string", "null"], "enum": [*dict.fromkeys(names), None]}
    item["properties"]["speaker"] = {**who, "description": STRUCTURED["descriptions"]["speaker"]}
    item["properties"]["target"] = {**who, "description": STRUCTURED["descriptions"]["target"]}
    return schema


def reformat_request(model: str, prose: str, names: Sequence[str]) -> dict[str, Any]:
    """The reformat model's request: the instruction naming who may speak, the prose, the schema."""
    listed = ", ".join(dict.fromkeys(names)) or "(no one: every item is narration)"
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": str(REFORMAT["instruction"]).replace("{{names}}", listed)},
            {"role": "user", "content": prose.strip()},
        ],
        "stream": False,
        "temperature": 0,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": STRUCTURED["schema_name"], "schema": reformat_schema(names), "strict": True},
        },
    }


def reformat_items(content: str, names: Sequence[str]) -> list[dict[str, Any]] | None:
    """The model's items in structured_runs' form ({fields, text, closed}), anyone not present made
    narration; None when the answer isn't items."""
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        return None
    items = parsed.get("items") if isinstance(parsed, Mapping) else None
    if not isinstance(items, list):
        return None
    present = {name.casefold() for name in names}
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, Mapping) or not isinstance(item.get("text"), str):
            continue
        kind = item.get("kind") if item.get("kind") in STRUCTURED["kinds"] else "narrate"
        speaker = item.get("speaker") if isinstance(item.get("speaker"), str) else None
        if speaker is not None and speaker.casefold() not in present:
            speaker = None
        target = item.get("target") if isinstance(item.get("target"), str) else None
        if target is not None and target.casefold() not in present:
            target = None
        if speaker is None:
            kind = "narrate"
        fields = {"kind": kind, "speaker": speaker, "target": target, "manner": item.get("manner")}
        out.append({"fields": fields, "text": item["text"], "closed": True})
    return out or None


def _words(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.casefold())


def faithful(prose: str, items: Sequence[Mapping[str, Any]]) -> bool:
    """Whether the items are the prose re-sorted, not rewritten: nearly every word of it kept
    (min_kept) and almost none added (max_added)."""
    had = _words(prose)
    got = _words(" ".join(str(item["text"]) for item in items))
    if not had:
        return False
    pool = {word: had.count(word) for word in set(had)}
    kept = 0
    for word in got:
        if pool.get(word, 0) > 0:
            pool[word] -= 1
            kept += 1
    return kept / len(had) >= float(REFORMAT["min_kept"]) and (len(got) - kept) / len(had) <= float(
        REFORMAT["max_added"]
    )
