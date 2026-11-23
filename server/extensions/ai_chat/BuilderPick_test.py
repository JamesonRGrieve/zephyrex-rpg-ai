# SPDX-License-Identifier: AGPL-3.0-or-later
"""AI-assisted character creation (the operator, 2026-11-23): picks only among the builder's options."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from zephyrex.extensions.ai_chat import BLL_AI_Chat  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BuilderPick import (  # type: ignore[import-not-found]
    open_choices,
    pick_question,
    pick_state,
    picked_option,
)

FIGHTER = {"trait_id": "t-fighter", "name": "Fighter", "description": "A master of arms."}
WIZARD = {"trait_id": "t-wizard", "name": "Wizard", "description": "A scholar of magic."}
ELF = {"trait_id": "t-elf", "name": "Elf"}
SAGE = {"trait_id": "t-sage", "name": "Sage"}


def _step(step: int, kind: str, chosen: dict[str, str] | None, options: list[dict[str, str]]) -> dict[str, object]:
    return {"step": step, "name": kind, "choices": [{"kind": kind, "chosen": chosen, "options": options}]}


BUILDER = {
    "steps": [
        _step(2, "species", None, [ELF]),
        _step(1, "class", None, [FIGHTER, WIZARD]),
        _step(3, "ability_scores", None, [{"trait_id": "x", "name": "x"}]),
        _step(4, "background", SAGE, []),
    ]
}


def test_open_choices_come_in_step_order_without_ability_scores() -> None:
    assert [choice["kind"] for choice in open_choices(BUILDER)] == ["class", "species"]


def test_the_question_offers_only_the_options_and_reads_the_picks_so_far() -> None:
    question = pick_question(open_choices(BUILDER)[0])
    assert question["type"] == "choice" and question["criteria"] == {
        "Fighter": "A master of arms.",
        "Wizard": "A scholar of magic.",
    }
    assert pick_state("A bookish elf", []) == "The character: A bookish elf\nChosen so far: nothing yet"
    assert pick_state("x", [{"kind": "class", "name": "Wizard"}]).endswith("Chosen so far: class: Wizard")


def test_an_answer_outside_the_options_is_left_to_the_person() -> None:
    choice = open_choices(BUILDER)[0]
    assert picked_option(choice, {"choice": "Wizard"}) == WIZARD
    assert picked_option(choice, {"choice": "Necromancer"}) is None
    assert picked_option(choice, None) is None


def test_the_route_picks_in_step_order_and_leaves_what_it_cannot(monkeypatch: pytest.MonkeyPatch) -> None:
    state: dict[str, Any] = {"class": None, "species": None}

    def builder() -> dict[str, Any]:
        species = [ELF] if state["class"] else []
        return {
            "steps": [
                _step(1, "class", state["class"], [FIGHTER, WIZARD]),
                _step(2, "species", state["species"], species),
                _step(3, "ability_scores", None, [ELF]),
            ]
        }

    async def read(_requester: str, _person: str) -> dict[str, Any]:
        return builder()

    chosen: list[tuple[str, str]] = []

    async def choose(_requester: str, _person: str, kind: str, trait_id: str) -> dict[str, Any]:
        chosen.append((kind, trait_id))
        state[kind] = {"trait_id": trait_id, "name": trait_id}
        return {}

    abilities = {"builder_choices": read, "choose": choose}
    monkeypatch.setattr(BLL_AI_Chat, "loaded_ability", lambda _registry, _ext, name: abilities.get(name))

    async def decide(purpose: str, _asked: Any, _state: str, questions: dict[str, Any]) -> dict[str, Any]:
        # The class is Wizard; the species answer names nothing offered, so it's left to the person.
        return {"pick": {"choice": "Wizard" if purpose == "Builder: class" else "Dragon"}}

    manager = SimpleNamespace(requester=SimpleNamespace(id="u1"), model_registry=None, _decide=decide)
    envelope = BLL_AI_Chat.BuilderPickRequestEnvelope.model_validate(
        {"builder_pick": {"person_id": "p1", "concept": "a bookish elf"}}
    )
    result = asyncio.run(BLL_AI_Chat.AIChatManager.builder_pick_route(manager, envelope))
    assert chosen == [("class", "t-wizard")]
    assert result.builder_pick.picked == [{"kind": "class", "trait_id": "t-wizard", "name": "Wizard"}]
    assert result.builder_pick.left == ["species"]
