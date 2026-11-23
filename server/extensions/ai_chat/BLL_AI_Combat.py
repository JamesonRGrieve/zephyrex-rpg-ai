# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn over the API (contract combat_turn; CombatTurn.py holds the rules).

``POST /v1/ai_chat/combat_turn`` ``{"combat_turn": {"chat_id", "encounter_id", "person_id"}}``: the VTT's
combat_options for that combatant, its questions (which action, whom it aims at) put to the decision
models in parallel and filed under the chat, then the picks resolved by the VTT's take_combat_action with
its own rolls. A combatant off its turn, with no action left, or whose decision is to hold does nothing.
"""

from __future__ import annotations

import inspect
from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from pydantic import Field
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.logic.AbstractLogicManager import AbstractBLLManager
from zephyrex.pydantic2.fastapi import AuthType, RouterMixin, RouteType


class CombatTurnRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    encounter_id: str = Field(..., min_length=1)
    person_id: str = Field(..., min_length=1)


class CombatTurnRequestEnvelope(PlainModel):
    combat_turn: CombatTurnRequest


class CombatTurn(PlainModel):
    acted: bool
    #: Why nothing was done: "not its turn", "no action", "holds", "no decision model".
    reason: str = ""
    action_id: str | None = None
    target_ids: list[str] = Field(default_factory=list)
    #: The VTT's result: hit, roll, damage, target_hp, target_defeated, steps…
    result: dict[str, Any] | None = None


class CombatTurnEnvelope(PlainModel):
    combat_turn: CombatTurn


class CombatTurnManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager)."""

    prefix: ClassVar[str | None] = "/v1/ai_chat/combat_turn"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=CombatTurnRequestEnvelope,
        output_model=CombatTurnEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="An AI-run combatant's turn: the VTT's options to the decision models, the picks resolved by the VTT",
    )
    async def combat_turn_route(self, body: CombatTurnRequestEnvelope) -> CombatTurnEnvelope:
        from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import AIChatManager, ChatManager  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.CombatTurn import combat_pick, combat_questions  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import world_entities_by_id  # type: ignore[import-not-found]

        asked = body.combat_turn
        requester = str(self.requester.id)
        ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.chat_id)
        read = loaded_ability(self.model_registry, "rpg_combat", "combat_options")
        act = loaded_ability(self.model_registry, "rpg_combat", "take_combat_action")
        if read is None or act is None:
            raise HTTPException(status_code=409, detail={"message": "The VTT has no combat here", "code": "no_combat"})

        async def called(ability: Any, *args: Any, **kwargs: Any) -> Any:
            answer = ability(*args, **kwargs)
            return await answer if inspect.isawaitable(answer) else answer

        options = await called(read, requester, asked.encounter_id, asked.person_id)
        if not isinstance(options, dict):
            raise HTTPException(status_code=422, detail={"message": "No combat options", "code": "no_options"})
        if not options.get("turn"):
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="not its turn"))
        rows = world_entities_by_id(self.model_registry, requester, [asked.person_id])
        person: dict[str, Any] = dict(next(iter(rows), None) or {})
        name = str(person.get("name") or "They")
        questions, by_action, by_target = combat_questions(options, name, str(person.get("summary") or ""))
        if not questions:
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="no action"))
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        state = f"{name}, {options.get('hp')}/{options.get('hp_max')} hit points, in a fight against: " + ", ".join(
            f"{one.get('name')} ({'hostile' if one.get('hostile') else 'friendly'}, {one.get('hp')} hit points)"
            for one in options.get("targets") or []
        )
        answers = await chats._decide("Combat: turn", asked, state, questions)
        if answers is None:
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="no decision model"))
        pick = combat_pick(answers, options, by_action, by_target)
        if pick is None:
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="holds"))
        result = await called(
            act, requester, asked.encounter_id, asked.person_id, pick["action_id"], target_ids=pick["target_ids"]
        )
        return CombatTurnEnvelope(
            combat_turn=CombatTurn(
                acted=True,
                action_id=pick["action_id"],
                target_ids=pick["target_ids"],
                result=dict(result) if isinstance(result, dict) else None,
            )
        )
