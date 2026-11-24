# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn (the operator, 2026-11-23): picks only among the VTT's combat options."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions import AbstractExtensionProvider
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat import BLL_AI_Chat, WikiReads  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.CombatTurn import (  # type: ignore[import-not-found]
    combat_pick,
    combat_questions,
    fight_sides,
    side_questions,
)
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
        assert purpose in ("Combat: start", "Combat: sides") and "Roll initiative" in state
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


def test_the_persons_line_is_read_for_its_action(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Zephyrex RPG's r47 (chat 20845cf2): "I draw my sword and strike at it" was never resolved.
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Mill"}}, headers=headers).json()["campaign"]["id"]
    brenna = server.post(
        "/v1/person", json={"person": {"name": "Brenna", "kind": "pc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "Mill", "character_ids": [brenna["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    said = {"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": ["I draw my sword and strike at it."]}}
    line = server.post("/v1/chat_message", json=said, headers=headers).json()["chat_message"]
    taken: list[tuple[str, list[str]]] = []
    passed: list[str] = []
    read: list[tuple[str, str, str]] = []

    async def combat_options(_requester: str, _encounter: str, _person: str) -> dict[str, Any]:
        return OPTIONS

    async def take_combat_action(
        _requester: str, _encounter: str, _person: str, action_id: str, target_ids: list[str] | None = None
    ) -> dict[str, Any]:
        taken.append((action_id, list(target_ids or [])))
        return {"hit": True, "roll": 17, "damage": 6}

    async def next_turn(_requester: str, encounter: str) -> dict[str, Any]:
        passed.append(encounter)
        return {}

    abilities = {"combat_options": combat_options, "take_combat_action": take_combat_action, "next_turn": next_turn}
    monkeypatch.setattr(AbstractExtensionProvider, "loaded_ability", lambda _registry, _ext, name: abilities.get(name))
    monkeypatch.setattr(WikiReads, "world_entities_by_id", lambda _r, _u, ids: [{"id": ids[0], "name": "Brenna"}])
    picks = [{"action": {"choice": "Longsword"}, "target": {"choice": "Wren"}}, {"action": {"choice": "hold"}}]

    async def decide(_self: Any, purpose: str, _asked: Any, state: str, questions: dict[str, Any]) -> Any:
        read.append((purpose, state, questions["action"]["instructions"]))
        return picks.pop(0)

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    turn_of = {"chat_id": chat["id"], "encounter_id": "e1", "person_id": brenna["id"], "line_id": line["id"]}
    asked = {"combat_turn": turn_of}
    turn = server.post("/v1/ai_chat/combat_turn", json=asked, headers=headers).json()["combat_turn"]
    assert turn["acted"] is True and taken == [("attack:longsword", ["p-wren"])] and passed == ["e1"]
    purpose, state, instructions = read[0]
    assert purpose == "Combat: person's turn" and "I draw my sword and strike at it." in state
    assert "describe" in instructions
    # A line that describes none of the options leaves the turn theirs.
    again = server.post("/v1/ai_chat/combat_turn", json=asked, headers=headers).json()["combat_turn"]
    assert again == {**again, "acted": False, "reason": "the line describes no action"} and passed == ["e1"]


SIDES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "combat-cases.json").read_text())


@pytest.mark.parametrize("case", SIDES["cases"], ids=lambda case: case["name"])
def test_who_is_on_which_side(case: dict[str, Any]) -> None:
    questions, party = side_questions(case["people"], case["party"])
    assert list(questions) == case["questions"]
    assert set(questions[case["questions"][0]]["criteria"]) == {"friendly", "hostile", "neutral"}
    assert fight_sides(case["answers"], questions, party) == case["sides"]


def test_a_fight_opens_with_its_sides(server: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Zephyrex RPG's r47 (chat 20845cf2): the drowned thing came out neutral, so no one could aim at it.
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Weir"}}, headers=headers).json()["campaign"]["id"]
    tam = server.post(
        "/v1/person", json={"person": {"name": "Tam", "kind": "pc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "Weir", "character_ids": [tam["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    shout = "A bloated drowned thing heaves itself out of the millrace at me. I strike at it."
    said = {"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": [shout]}}
    line = server.post("/v1/chat_message", json=said, headers=headers).json()["chat_message"]
    opened: list[dict[str, Any]] = []

    async def current_encounter(_requester: str, _campaign: str) -> None:
        return None

    async def start_encounter(
        _requester: str,
        _campaign: str,
        scene_id: str | None = None,
        person_ids: list[str] | None = None,
        sides: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        opened.append({"person_ids": person_ids, "sides": sides})
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
    rows = {
        "brenna": {"id": "brenna", "name": "Brenna", "kind": "pc"},
        "hesk": {"id": "hesk", "name": "Old Hesk", "kind": "npc"},
        "drowned": {"id": "drowned", "name": "Drowned Thing", "kind": "npc"},
    }

    async def scene(_registry: Any, _requester: str, _campaign: str | None) -> dict[str, Any]:
        return {"id": "s1"}

    async def people(_registry: Any, _requester: str, _campaign: str | None) -> list[str]:
        return list(rows)

    monkeypatch.setattr(WikiReads, "scene_now", scene)
    monkeypatch.setattr(WikiReads, "scene_people", people)
    monkeypatch.setattr(WikiReads, "world_entities_by_id", lambda _r, _u, ids: [rows[one] for one in ids])
    asked_of: list[list[str]] = []

    async def decide(_self: Any, _purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> Any:
        asked_of.append(list(questions))
        if "fight" in questions:
            return {"fight": {"choice": "a fight starts"}}
        return {"side_hesk": {"choice": "neutral"}, "side_drowned": {"choice": "hostile"}}

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    asked = {"combat_check": {"chat_id": chat["id"], "leaf_id": line["id"]}}
    answer = server.post("/v1/ai_chat/combat_check", json=asked, headers=headers).json()["combat_check"]
    assert answer["started"] is True
    # The sides only once a fight starts, and never the party's.
    assert asked_of == [["fight"], ["side_hesk", "side_drowned"]]
    assert opened[0]["sides"] == {"brenna": "friendly", "hesk": "neutral", "drowned": "hostile"}
