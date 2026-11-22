# SPDX-License-Identifier: AGPL-3.0-or-later
"""The world read once per requester's campaign, then only what changed since (Self Hosted AI, 2026-11-22)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from zephyrex.extensions.ai_chat import WikiReads  # type: ignore[import-not-found]


def test_the_world_is_read_whole_once_then_only_its_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[datetime | None] = []
    pages = [
        [
            {"id": "bar", "name": "The Barkeep", "deleted": False},
            {"id": "rest", "name": "River's Rest", "deleted": False},
        ],
        [{"id": "bar", "name": "The Barkeep", "deleted": True}],
    ]

    def world_entities(_registry: Any, _requester: str, _campaign: str, **page: Any) -> dict[str, Any]:
        asked.append(page["since"])
        return {"world_entities": pages[len(asked) - 1], "next": None}

    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, _name: world_entities)
    monkeypatch.setattr(WikiReads, "_WORLD", {})
    first = WikiReads.world_entities_page(None, "u1", "c1")
    assert [one["id"] for one in first] == ["bar", "rest"]
    again = WikiReads.world_entities_page(None, "u1", "c1")
    # The second read asks only for changes since the first, and a tombstone replaces its record.
    assert asked[0] is None and isinstance(asked[1], datetime)
    assert [(one["id"], one["deleted"]) for one in again] == [("bar", True), ("rest", False)]
