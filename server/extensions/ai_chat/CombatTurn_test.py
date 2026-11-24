# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn (the operator, 2026-11-23): picks only among the VTT's combat options."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions import AbstractExtensionProvider
from zephyrex.extensions.ai_chat import BLL_AI_Chat, WikiReads  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.CombatTurn import combat_pick, combat_questions  # type: ignore[import-not-found]
from zephyrex.testing.factories import create_user

from rpg_ai_app import create

SWORD = {
    "id": "attack:longsword",
    "kind": "attack",
    "name": "Longsword",
    "needs_target": True,
    "targets": ["p-wren", "p-bram"],
    "slot_levels": [],
    "summary": "+5 to hit, 1d8+3 slashing; melee",
}
OPTIONS: dict[str, Any] = {
    "turn": True,
    "action_available": True,
    "reaction": {"available": True, "trigger": None},
    "actions": [SWORD],
    "targets": [
        {"person_id": "p-bram", "name": "Bram", "hostile": False, "hp": 9},
        {"person_id": "p-wren", "name": "Wren", "hostile": True, "hp": 12},
    ],
    "reach": "unchecked",
    "hp": 11,
    "hp_max": 11,
}


def test_the_questions_offer_only_the_vtts_actions_and_targets() -> None:
    questions, by_action, by_target = combat_questions(OPTIONS, "Guard", "A tired gate guard.")
    assert set(questions["action"]["criteria"]) == {"Longsword", "hold"}
    assert list(questions["target"]["criteria"]) == ["Wren", "Bram"]  # the hostile first
    assert "isn't checked" in questions["target"]["instructions"]
    assert by_action == {"Longsword": "attack:longsword"} and by_target == {"Wren": "p-wren", "Bram": "p-bram"}
    assert combat_questions({**OPTIONS, "turn": False}, "Guard", "") == ({}, {}, {})
    assert combat_questions({**OPTIONS, "action_available": False}, "Guard", "") == ({}, {}, {})


def test_a_pick_outside_the_options_holds() -> None:
    _questions, by_action, by_target = combat_questions(OPTIONS, "Guard", "")
    answers = {"action": {"choice": "Longsword"}, "target": {"choice": "Wren"}}
    picked = combat_pick(answers, OPTIONS, by_action, by_target)
    assert picked == {"action_id": "attack:longsword", "target_ids": ["p-wren"]}
    assert combat_pick({"action": {"choice": "hold"}}, OPTIONS, by_action, by_target) is None
    assert combat_pick({"action": {"choice": "Fireball"}}, OPTIONS, by_action, by_target) is None
    stranger = {"action": {"choice": "Longsword"}, "target": {"choice": "Mags"}}
    assert combat_pick(stranger, OPTIONS, by_action, by_target) is None


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def test_the_route_resolves_the_pick_through_the_vtt(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Gate"}}, headers=headers).json()["campaign"]["id"]
    guard = server.post(
        "/v1/person", json={"person": {"name": "Guard", "kind": "npc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "Gate", "character_ids": [guard["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    taken: list[tuple[str, list[str]]] = []

    async def combat_options(_requester: str, _encounter: str, _person: str) -> dict[str, Any]:
        return OPTIONS

    async def take_combat_action(
        _requester: str, _encounter: str, _person: str, action_id: str, target_ids: list[str] | None = None
    ) -> dict[str, Any]:
        taken.append((action_id, list(target_ids or [])))
        return {"hit": True, "roll": 14, "total": 19, "damage": 7, "target_hp": 5, "target_defeated": False}

    abilities = {"combat_options": combat_options, "take_combat_action": take_combat_action}
    monkeypatch.setattr(AbstractExtensionProvider, "loaded_ability", lambda _registry, _ext, name: abilities.get(name))
    monkeypatch.setattr(WikiReads, "world_entities_by_id", lambda _r, _u, ids: [{"id": ids[0], "name": "Guard"}])

    async def decide(_self: Any, purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> dict[str, Any]:
        assert purpose == "Combat: turn" and set(questions) == {"action", "target"}
        return {"action": {"choice": "Longsword"}, "target": {"choice": "Wren"}}

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    asked = {"combat_turn": {"chat_id": chat["id"], "encounter_id": "e1", "person_id": guard["id"]}}
    answer = server.post("/v1/ai_chat/combat_turn", json=asked, headers=headers)
    assert answer.status_code == 200, answer.text
    turn = answer.json()["combat_turn"]
    assert turn["acted"] is True and turn["result"]["damage"] == 7
    assert taken == [("attack:longsword", ["p-wren"])]


def test_a_fight_the_story_starts_opens_the_vtts_encounter(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Live run 4 (Zephyrex RPG, 2026-11-23): "Roll initiative!" opened no encounter.
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "River"}}, headers=headers).json()["campaign"]["id"]
    tam = server.post(
        "/v1/person", json={"person": {"name": "Tam", "kind": "npc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "River", "character_ids": [tam["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    shout = "It heaves itself out at Tam. Roll initiative!"
    said = {"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": [shout]}}
    line = server.post("/v1/chat_message", json=said, headers=headers).json()["chat_message"]
    opened: list[dict[str, Any]] = []

    async def current_encounter(_requester: str, _campaign: str) -> None:
        return None

    async def start_encounter(_requester: str, campaign_id: str, **fields: Any) -> dict[str, Any]:
        opened.append({"campaign_id": campaign_id, **fields})
        return {"id": "e1"}

    async def roll_initiative(_requester: str, _encounter: str) -> dict[str, Any]:
        return {}

    async def start_combat(_requester: str, _encounter: str) -> dict[str, Any]:
        return {"status": "running", "round": 1, "current_combatant_id": "x"}

    found = {
        "current_encounter": current_encounter,
        "start_encounter": start_encounter,
        "roll_initiative": roll_initiative,
        "start_combat": start_combat,
    }
    monkeypatch.setattr(AbstractExtensionProvider, "loaded_ability", lambda _registry, _ext, name: found.get(name))

    async def scene(_registry: Any, _requester: str, _campaign: str | None) -> dict[str, Any]:
        return {"id": "s1"}

    async def people(_registry: Any, _requester: str, _campaign: str | None) -> list[str]:
        return [tam["id"], "p-beast"]

    monkeypatch.setattr(WikiReads, "scene_now", scene)
    monkeypatch.setattr(WikiReads, "scene_people", people)

    async def decide(_self: Any, purpose: str, _asked: Any, state: str, _questions: dict[str, Any]) -> dict[str, Any]:
        assert purpose == "Combat: start" and "Roll initiative" in state
        return {"fight": {"choice": "a fight starts"}}

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    asked = {"combat_check": {"chat_id": chat["id"], "leaf_id": line["id"]}}
    answer = server.post("/v1/ai_chat/combat_check", json=asked, headers=headers)
    assert answer.status_code == 200, answer.text
    assert answer.json()["combat_check"]["started"] is True and answer.json()["combat_check"]["encounter_id"] == "e1"
    assert opened == [{"campaign_id": world, "scene_id": "s1", "person_ids": [tam["id"], "p-beast"]}]


def test_a_fight_the_vtt_cant_start_is_said_and_a_stuck_one_is_started(
    server: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Zephyrex RPG's live run, chat 54763f15: pregens without sheets rolled no initiative, the VTT refused to
    # start, and the encounter sat in setup at round 0 while combat_check said started.
    from fastapi import HTTPException

    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Mill"}}, headers=headers).json()["campaign"]["id"]
    brenna = server.post(
        "/v1/person", json={"person": {"name": "Brenna", "kind": "pc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "Mill", "character_ids": [brenna["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    said = {"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": ["I strike at the drowned thing."]}}
    line = server.post("/v1/chat_message", json=said, headers=headers).json()["chat_message"]
    state: dict[str, Any] = {"current": None, "opened": [], "ended": [], "started": []}

    async def current_encounter(_requester: str, _campaign: str) -> Any:
        return state["current"]

    async def start_encounter(_requester: str, _campaign: str, **_fields: Any) -> dict[str, Any]:
        state["opened"].append("e1")
        return {"id": "e1"}

    async def roll_initiative(_requester: str, _encounter: str) -> dict[str, Any]:
        return {"unrolled": [{"name": "Brenna", "reason": "No character to roll for"}]}

    async def start_combat(_requester: str, encounter: str) -> dict[str, Any]:
        if encounter == "e1":
            raise HTTPException(status_code=422, detail={"message": "Roll or set initiative first for: Brenna"})
        state["started"].append(encounter)
        return {"id": encounter, "status": "running", "round": 1, "current_combatant_id": "c1"}

    async def end_encounter(_requester: str, encounter: str) -> dict[str, Any]:
        state["ended"].append(encounter)
        return {}

    found = {
        "current_encounter": current_encounter,
        "start_encounter": start_encounter,
        "roll_initiative": roll_initiative,
        "start_combat": start_combat,
        "end_encounter": end_encounter,
    }
    monkeypatch.setattr(AbstractExtensionProvider, "loaded_ability", lambda _registry, _ext, name: found.get(name))

    async def scene(_registry: Any, _requester: str, _campaign: str | None) -> dict[str, Any]:
        return {"id": "s1"}

    async def people(_registry: Any, _requester: str, _campaign: str | None) -> list[str]:
        return [brenna["id"]]

    monkeypatch.setattr(WikiReads, "scene_now", scene)
    monkeypatch.setattr(WikiReads, "scene_people", people)

    async def decide(_self: Any, _purpose: str, _asked: Any, _state: str, _questions: dict[str, Any]) -> Any:
        return {"fight": {"choice": "a fight starts"}}

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    asked = {"combat_check": {"chat_id": chat["id"], "leaf_id": line["id"]}}
    refused = server.post("/v1/ai_chat/combat_check", json=asked, headers=headers).json()["combat_check"]
    assert refused["started"] is False and refused["encounter_id"] is None
    assert "Roll or set initiative first for: Brenna" in refused["reason"]
    assert "Brenna: No character to roll for" in refused["reason"]
    assert state["ended"] == ["e1"]
    # One left in setup (the GM's, or a start that couldn't be ended) is started, never "already".
    state["current"] = {"id": "e2", "status": "setup", "round": 0}
    started = server.post("/v1/ai_chat/combat_check", json=asked, headers=headers).json()["combat_check"]
    assert started["started"] is True and started["encounter_id"] == "e2"
    assert state["started"] == ["e2"] and state["opened"] == ["e1"]
