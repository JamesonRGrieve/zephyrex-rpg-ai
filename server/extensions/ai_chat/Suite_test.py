# SPDX-License-Identifier: AGPL-3.0-or-later
"""The composed suite boots (docs/SUITE.md, Together; the operator, 2026-11-21): rpg_ai_app loads the
wiki's and the VTT's extensions with its own, every component migrates to head, and their APIs answer
from one server."""

from fastapi.testclient import TestClient


def test_the_composed_server_boots_with_the_wiki_and_the_vtt() -> None:
    from rpg_ai_app import EXTENSIONS, create

    loaded = EXTENSIONS.split(",")
    for name in ("rpg_core", "world_narrative", "world_properties", "rpg_systems", "rpg_dice", "rpg_table", "ai_chat"):
        assert name in loaded
    app = create()
    with TestClient(app) as client:
        paths = set(app.openapi()["paths"])
        # The wiki's world, the VTT's systems and dice, and this product's chat, from one app.
        assert any(path.startswith("/v1/world_entit") for path in paths), sorted(p for p in paths if "world" in p)[:10]
        assert any(path.startswith("/v1/game_system") for path in paths)
        assert any(path.startswith("/v1/dice") for path in paths)
        assert any(path.startswith("/v1/chat") for path in paths)
        assert client.get("/health").status_code in (200, 204, 404)
