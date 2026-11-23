# SPDX-License-Identifier: AGPL-3.0-or-later
"""A new NPC's stat block picked by the decision model among the VTT's options (the operator, 2026-11-23:
"is a new NPC needed, of what level, class and subclass")."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from zephyrex.extensions.ai_chat import BLL_AI_Chat, WikiReads  # type: ignore[import-not-found]


def _option(id_: str, name: str, cr: float, summary: str) -> dict[str, Any]:
    return {"id": id_, "name": name, "level_or_cr": cr, "class": None, "subclass": None, "summary": summary}


OPTIONS = [_option("guard", "Guard", 0.125, "CR 0.125; AC 16"), _option("priest", "Priest", 2, "CR 2; spells")]
PICK = BLL_AI_Chat.AIChatManager._npc_option


def _manager(decide: Any) -> Any:
    return SimpleNamespace(requester=SimpleNamespace(id="u1"), model_registry=None, _decide=decide)


def test_the_pick_is_only_among_the_vtts_options(monkeypatch: pytest.MonkeyPatch) -> None:
    async def options(_registry: Any, _requester: str, _campaign: str | None) -> list[dict[str, Any]]:
        return OPTIONS

    asked: list[dict[str, Any]] = []

    async def decide(purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> dict[str, Any]:
        asked.append(questions)
        return {"sheet": {"choice": "Guard"}}

    monkeypatch.setattr(BLL_AI_Chat, "npc_sheet_options", options)
    picked = asyncio.run(PICK(_manager(decide), None, "c1", "Bram", "gate guard", "A tired man."))
    assert picked == "guard"
    assert asked[0]["sheet"]["criteria"] == {"Guard": "CR 0.125; AC 16", "Priest": "CR 2; spells"}

    async def outside(purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> dict[str, Any]:
        return {"sheet": {"choice": "Dragon"}}

    # An answer outside the options leaves the VTT's closest match.
    assert asyncio.run(PICK(_manager(outside), None, "c1", "Bram", "guard", "")) is None


def test_no_options_asks_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def none(_registry: Any, _requester: str, _campaign: str | None) -> list[dict[str, Any]]:
        return []

    async def decide(*_args: Any) -> dict[str, Any]:
        raise AssertionError("asked with no options")

    monkeypatch.setattr(BLL_AI_Chat, "npc_sheet_options", none)
    assert asyncio.run(PICK(_manager(decide), None, "c1", "Bram", "guard", "")) is None


def test_the_vtts_options_are_read_and_kept_whole(monkeypatch: pytest.MonkeyPatch) -> None:
    async def npc_sheet_options(_requester: str, _campaign: str) -> dict[str, Any]:
        return {"system": "srd-5e", "options": [*OPTIONS, {"id": "", "name": "broken"}]}

    monkeypatch.setattr(WikiReads, "loaded_ability", lambda _registry, _ext, name: npc_sheet_options)
    assert [one["id"] for one in asyncio.run(WikiReads.npc_sheet_options(None, "u1", "c1"))] == ["guard", "priest"]
    assert asyncio.run(WikiReads.npc_sheet_options(None, "u1", None)) == []
