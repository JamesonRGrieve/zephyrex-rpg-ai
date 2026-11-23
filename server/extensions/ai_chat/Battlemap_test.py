# SPDX-License-Identifier: AGPL-3.0-or-later
"""Generated battlemaps (Zephyrex RPG for the operator, 2026-11-22)."""

from __future__ import annotations

import pytest
from zephyrex.extensions.ai_chat import Battlemap  # type: ignore[import-not-found]


def test_the_prompt_names_the_place_and_its_summary() -> None:
    # The operator, 2026-11-23: "The map is a real map: a top-down battlemap, never a location's illustration."
    tail = ". No perspective, no horizon, no characters, no creatures, no text, no labels, no grid"
    head = "strictly top-down orthographic tabletop RPG battle map, a floor plan seen from directly above, of "
    assert Battlemap.battlemap_prompt("The Split Antler", "A smoky\n inn  by the ford.") == (
        head + "The Split Antler: A smoky inn by the ford" + tail
    )
    assert Battlemap.battlemap_prompt("The Ford", "") == head + "The Ford" + tail


def test_only_a_scene_with_no_picture_is_drawn_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Battlemap, "_DRAWN", set())
    assert Battlemap.needs_battlemap({"id": "s1", "background_url": None})
    Battlemap.mark_drawn("s1")
    assert not Battlemap.needs_battlemap({"id": "s1", "background_url": None})
    assert Battlemap.needs_battlemap({"id": "s1", "background_url": None}, force=True)
    assert not Battlemap.needs_battlemap({"id": "s2", "background_url": "/v1/asset/a/content"})
    # A VTT that doesn't say whether the scene has a picture: left alone.
    assert not Battlemap.needs_battlemap({"id": "s3"})
    assert not Battlemap.needs_battlemap(None)
    assert Battlemap.asset_link("a1") == "/v1/asset/a1/content"
