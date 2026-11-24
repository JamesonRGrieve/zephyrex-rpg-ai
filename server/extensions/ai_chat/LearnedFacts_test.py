# SPDX-License-Identifier: AGPL-3.0-or-later
"""What a scene reveals to the party, against contract/learned-facts-cases.json."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.LearnedFacts import learn_questions, learned  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "learned-facts-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_what_the_party_learns(case: dict[str, Any]) -> None:
    questions, about = learn_questions(case["text"], CASES["pcs"], CASES["entities"])
    assert len(questions) == case["questions"]
    assert all(pc != entity["id"] for pc, entity in about.values())
    assert learned(case["answers"], about) == case["learned"]


def test_a_line_teaches_the_pcs_on_the_scene(monkeypatch: pytest.MonkeyPatch) -> None:
    # The wiki's learn_fact (60b18a2): the operator's learned facts, kept as "knows of" records.
    from fastapi.testclient import TestClient
    from zephyrex.extensions import AbstractExtensionProvider
    from zephyrex.extensions.ai_chat import BLL_AI_Chat, WikiReads  # type: ignore[import-not-found]
    from zephyrex.testing.factories import create_user

    from rpg_ai_app import create

    server = TestClient(create())
    user = create_user(server)  # type: ignore[no-untyped-call]
    headers = {"Authorization": f"Bearer {user.jwt}"}
    world = server.post("/v1/campaign", json={"campaign": {"name": "Mill"}}, headers=headers).json()["campaign"]["id"]
    brenna = server.post(
        "/v1/person", json={"person": {"name": "Brenna", "kind": "pc", "campaign_id": world}}, headers=headers
    ).json()["person"]
    made = {"chat": {"title": "Mill", "character_ids": [brenna["id"]], "campaign_id": world}}
    chat = server.post("/v1/chat", json=made, headers=headers).json()["chat"]
    said = {"chat_message": {"chat_id": chat["id"], "role": "user", "swipes": ["Old Hesk points at Blackwater Mill."]}}
    line = server.post("/v1/chat_message", json=said, headers=headers).json()["chat_message"]
    kept: list[dict[str, Any]] = []

    def learn_fact(_registry: Any, _requester: str, **fact: Any) -> dict[str, Any]:
        kept.append(fact)
        return {"known_fact": {}, "created": True}

    monkeypatch.setattr(
        AbstractExtensionProvider, "loaded_ability", lambda _r, _e, name: learn_fact if name == "learn_fact" else None
    )

    async def people(_registry: Any, _requester: str, _campaign: str | None) -> list[str]:
        return [brenna["id"]]

    monkeypatch.setattr(WikiReads, "scene_people", people)
    monkeypatch.setattr(WikiReads, "world_entities_by_id", lambda _r, _u, ids: [{**brenna, "kind": "pc"}])
    monkeypatch.setattr(WikiReads, "world_entities_page", lambda _r, _u, _c: CASES["entities"])

    async def decide(_self: Any, purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> Any:
        assert purpose == "learned_facts"
        return {key: {"choice": "knows of"} for key in questions}

    monkeypatch.setattr(BLL_AI_Chat.AIChatManager, "_decide", decide)
    asked = {"learned": {"chat_id": chat["id"], "leaf_id": line["id"]}}
    answer = server.post("/v1/ai_chat/learned", json=asked, headers=headers)
    assert answer.status_code == 200, answer.text
    assert [one["target_entity_id"] for one in answer.json()["learned"]["learned"]] == ["hesk", "mill"]
    assert all(one["text"] is None and one["person_id"] == brenna["id"] for one in kept)
