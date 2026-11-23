# SPDX-License-Identifier: AGPL-3.0-or-later
"""AI-assisted character creation (the operator, 2026-11-23): picks only among the builder's options."""

from __future__ import annotations

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
