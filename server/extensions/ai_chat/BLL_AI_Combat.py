# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn over the API (contract combat_turn; CombatTurn.py holds the rules).

``POST /v1/ai_chat/combat_turn`` ``{"combat_turn": {"chat_id", "encounter_id", "person_id"}}``: the VTT's
combat_options for that combatant, its questions (which action, whom it aims at) put to the decision
models in parallel and filed under the chat, then the picks resolved by the VTT's take_combat_action with
its own rolls, then the VTT's next_turn. A combatant off its turn does nothing; one with no action left
or whose decision is to hold passes the turn.

``POST /v1/ai_chat/combat_check`` ``{"combat_check": {"chat_id", "leaf_id"}}``: whether the story's latest
line starts a fight (the decision model), and if so the VTT's encounter for everyone on the scene (or the
one already in setup), its initiative rolled and round 1 begun (live run 4: "Roll initiative!" had opened
nothing). A fight the VTT couldn't start answers started=false with the VTT's reason, and an encounter
made just for it is ended.
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


class CombatCheckRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class CombatCheckRequestEnvelope(PlainModel):
    combat_check: CombatCheckRequest


class CombatCheck(PlainModel):
    #: True when this call started the fight (false: one was already going, or none starts).
    started: bool
    encounter_id: str | None = None
    #: The VTT's order (round, whose turn, each combatant's initiative), when there's a fight.
    order: dict[str, Any] | None = None
    reason: str = ""


class CombatCheckEnvelope(PlainModel):
    combat_check: CombatCheck


async def _called(ability: Any, *args: Any, **kwargs: Any) -> Any:
    answer = ability(*args, **kwargs)
    return await answer if inspect.isawaitable(answer) else answer


class CombatCheckManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only: whether the story has started a fight, and the VTT's encounter opened for it."""

    prefix: ClassVar[str | None] = "/v1/ai_chat/combat_check"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=CombatCheckRequestEnvelope,
        output_model=CombatCheckEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Whether the story's latest line starts a fight; if so the VTT's encounter, initiative rolled",
    )
    async def combat_check_route(self, body: CombatCheckRequestEnvelope) -> CombatCheckEnvelope:
        """Live run 4 (Zephyrex RPG, 2026-11-23): "Roll initiative!" opened no encounter, so no AI combatant
        ever got a turn. The decision model says whether the latest line starts a fight; the VTT opens it
        with everyone on the scene, rolls initiative under its pack and starts round 1."""
        from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
        from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
            CampaignFrameManager,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import (  # type: ignore[import-not-found]
            AIChatManager,
            ChatManager,
            ChatMessageManager,
            shown_text,
            wiki_campaign_for,
        )
        from zephyrex.extensions.ai_chat.CombatTurn import COMBAT  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import scene_now, scene_people  # type: ignore[import-not-found]

        asked = body.combat_check
        requester = str(self.requester.id)
        chat = ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.chat_id)
        wiki = wiki_campaign_for(
            CampaignFrameManager(requester_id=requester, model_registry=self.model_registry), chat.campaign_id
        )
        current = loaded_ability(self.model_registry, "rpg_combat", "current_encounter")
        start = loaded_ability(self.model_registry, "rpg_combat", "start_encounter")
        roll = loaded_ability(self.model_registry, "rpg_combat", "roll_initiative")
        begin = loaded_ability(self.model_registry, "rpg_combat", "start_combat")
        if not wiki or None in (current, start, roll, begin):
            return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="no combat here"))
        going = await _called(current, requester, wiki)
        # Only a running fight is one already going: an encounter still in setup (a start that failed, or one
        # the GM is preparing) is started, never a reason to stop (Zephyrex RPG's live run, chat 54763f15:
        # one stuck in setup at round 0).
        if isinstance(going, dict) and going.get("id") and going.get("status") == "running":
            return CombatCheckEnvelope(
                combat_check=CombatCheck(started=False, encounter_id=str(going["id"]), order=going, reason="already")
            )
        waiting = str(going["id"]) if isinstance(going, dict) and going.get("id") else None
        rows = ChatMessageManager(requester_id=requester, model_registry=self.model_registry).list(chat_id=chat.id)
        line = next((one for one in rows if asked.leaf_id and str(one.id) == asked.leaf_id), None) or (
            max(rows, key=lambda one: (str(one.created_at), str(one.id))) if rows else None
        )
        if line is None:
            return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="no line"))
        question = {
            "type": "choice",
            "instructions": str(COMBAT["start_question"]),
            "criteria": [str(COMBAT["start_yes"]), str(COMBAT["start_no"])],
        }
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        answers = await chats._decide("Combat: start", asked, shown_text(line), {"fight": question})
        if not (answers or {}).get("fight"):
            # Not "no": the decision model gave nothing (its DecisionCall says why), so the caller may ask again.
            return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="no decision"))
        if ((answers or {}).get("fight") or {}).get("choice") != COMBAT["start_yes"]:
            return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="no fight"))
        if waiting is not None:
            encounter_id = waiting
        else:
            scene = await scene_now(self.model_registry, requester, wiki)
            people = await scene_people(self.model_registry, requester, wiki)
            if not people:
                return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="no one on the scene"))
            made = await _called(
                start, requester, wiki, scene_id=str(scene["id"]) if scene else None, person_ids=people
            )
            encounter_id = str(made.get("id") or made.get("encounter_id") or "") if isinstance(made, dict) else ""
            if not encounter_id:
                return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="the VTT opened no fight"))
        # Each step's answer is read: a fight the VTT couldn't start is said, never reported as started (Zephyrex
        # RPG's live run, chat 54763f15: pregens without sheets rolled no initiative, and the fight sat in setup).
        rolled: Any = None
        order: Any = None
        refused = ""
        try:
            rolled = await _called(roll, requester, encounter_id)
            order = await _called(begin, requester, encounter_id)
        except HTTPException as failed:
            detail = failed.detail
            refused = str(detail.get("message") if isinstance(detail, dict) else detail)
        if isinstance(order, dict) and order.get("status") == "running":
            return CombatCheckEnvelope(combat_check=CombatCheck(started=True, encounter_id=encounter_id, order=order))
        unrolled = [
            f"{one.get('name')}: {one.get('reason')}"
            for one in (rolled.get("unrolled") if isinstance(rolled, dict) else None) or []
            if isinstance(one, dict)
        ]
        reason = "; ".join([one for one in [refused or "the VTT didn't start it", *unrolled] if one])
        if waiting is None:
            # The encounter made just now isn't left half made, so the next fight can start.
            ending = loaded_ability(self.model_registry, "rpg_combat", "end_encounter")
            if ending is not None:
                try:
                    await _called(ending, requester, encounter_id)
                except HTTPException:
                    pass  # it couldn't be ended: it stays in setup, and the next check starts it
        return CombatCheckEnvelope(
            combat_check=CombatCheck(
                started=False,
                encounter_id=None if waiting is None else encounter_id,
                reason=f"the VTT couldn't start the fight: {reason}",
            )
        )


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
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import AIChatManager, ChatManager
        from zephyrex.extensions.ai_chat.CombatTurn import combat_pick, combat_questions
        from zephyrex.extensions.ai_chat.WikiReads import world_entities_by_id

        asked = body.combat_turn
        requester = str(self.requester.id)
        ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.chat_id)
        read = loaded_ability(self.model_registry, "rpg_combat", "combat_options")
        act = loaded_ability(self.model_registry, "rpg_combat", "take_combat_action")
        if read is None or act is None:
            raise HTTPException(status_code=409, detail={"message": "The VTT has no combat here", "code": "no_combat"})

        called = _called
        advance = loaded_ability(self.model_registry, "rpg_combat", "next_turn")

        async def passed() -> None:
            # The turn passes on once this combatant has acted or held (the VTT's next_turn).
            if advance is not None:
                await called(advance, requester, asked.encounter_id)

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
            await passed()
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
            await passed()
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="holds"))
        result = await called(
            act, requester, asked.encounter_id, asked.person_id, pick["action_id"], target_ids=pick["target_ids"]
        )
        await passed()
        return CombatTurnEnvelope(
            combat_turn=CombatTurn(
                acted=True,
                action_id=pick["action_id"],
                target_ids=pick["target_ids"],
                result=dict(result) if isinstance(result, dict) else None,
            )
        )
