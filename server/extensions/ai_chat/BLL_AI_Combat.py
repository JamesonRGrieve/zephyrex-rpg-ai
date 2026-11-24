# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn over the API (contract combat_turn; CombatTurn.py holds the rules).

``POST /v1/ai_chat/combat_turn`` ``{"combat_turn": {"chat_id", "encounter_id", "person_id"}}``: the VTT's
combat_options for that combatant, its questions (which action, whom it aims at) put to the decision
models in parallel and filed under the chat, then the picks resolved by the VTT's take_combat_action with
its own rolls, then the VTT's next_turn. A combatant off its turn does nothing; one with no action left
or whose decision is to hold passes the turn. With ``line_id`` it is the person's own turn: their line is
read for which of the VTT's options it describes, and that one is taken (the VTT rolls).

``POST /v1/ai_chat/combat_check`` ``{"combat_check": {"chat_id", "leaf_id"}}``: whether the story's latest
line starts a fight (the decision model), and if so the VTT's encounter for everyone on the scene (or the
one already in setup), its initiative rolled and round 1 begun (live run 4: "Roll initiative!" had opened
nothing). A fight the VTT couldn't start answers started=false with the VTT's reason, and an encounter
made just for it is ended.
"""

from __future__ import annotations

import inspect
from collections.abc import Mapping, Sequence
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
    #: The person's own turn: their line, read for which of the VTT's options it describes (never one chosen
    #: for them). Without it, an AI-run combatant's turn.
    line_id: str | None = None


class CombatTurnRequestEnvelope(PlainModel):
    combat_turn: CombatTurnRequest


class CombatTurn(PlainModel):
    acted: bool
    #: Why nothing was done: "not its turn", "no action", "holds", "no decision model", "the line describes no
    #: action" (the person's turn, which stays theirs).
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


def _is_pc(entity: Mapping[str, Any]) -> bool:
    """A player character: the wiki's PC tag (Party.py's rule), or a record whose kind says so."""
    from zephyrex.extensions.ai_chat.Party import PARTY  # type: ignore[import-not-found]

    return "pc" in (entity.get("kind"), entity.get("person_kind")) or PARTY["tag"] in (entity.get("tags") or [])


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
        from zephyrex.extensions.ai_chat.BLL_AI_Session import play_context  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.CombatTurn import (  # type: ignore[import-not-found]
            COMBAT,
            answered_stances,
            combat_stances,
        )
        from zephyrex.extensions.ai_chat.MapStep import _named  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.NpcAuthor import attackers  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import (  # type: ignore[import-not-found]
            scene_now,
            scene_people,
            world_entities_by_id,
        )

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
            # A line that names a combatant may turn them ("the guard surrenders", "she turns on them"): asked
            # again, and the VTT's set_disposition moves them (the operator, 2026-11-24).
            turned = await self._turned(asked, chat, wiki, going, requester)
            return CombatCheckEnvelope(
                combat_check=CombatCheck(started=False, encounter_id=str(going["id"]), order=turned, reason="already")
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
            # Who is on which side: the party friendly, each other person on the scene put to the decision model,
            # asked only once a fight starts (Zephyrex RPG's r47, chat 20845cf2: the foe came out neutral, so no
            # one could aim at it). Unanswered, the VTT's own rule stands for them.
            seat, _marks = play_context(requester, self.model_registry, chat.id)
            found = world_entities_by_id(self.model_registry, requester, list(people))
            named = [{"id": str(one["id"]), "name": str(one.get("name") or "")} for one in found if one.get("name")]
            # The party: the seat, every PC (the wiki's PC tag, or a person_kind of "pc": a world entity's kind is
            # "person", so kind "pc" never matched, and Tam was asked about and turned on the seat), and, until the
            # wiki's world entity carries the person's own kind (asked of Zephyrex RPG Wiki), the chat's cast less
            # whoever the line brings in to attack (an authored creature joins the cast: on build56 the drowned
            # thing came out friendly).
            said = shown_text(line)
            members = {str(one) for one in getattr(chat, "character_ids", None) or []}
            attacking_ids = set(attackers(said, named))
            pcs = [
                str(one["id"])
                for one in found
                if _is_pc(one)
                or str(one["id"]) == seat
                or (str(one["id"]) in members and str(one["id"]) not in attacking_ids)
            ]
            # Each one's own disposition toward the others (the operator, 2026-11-24: "Combat sides should be
            # based on character disposition not blanket red team and blue team"): the chat's, then the
            # wiki's current attitude; the decision model only where there's none or the line names them.
            reading = loaded_ability(self.model_registry, "rpg_core", "current_attitudes")
            attitudes: Any = {}
            if reading is not None:
                try:
                    attitudes = await _called(reading, self.model_registry, requester, wiki, list(people)) or {}
                except HTTPException:
                    attitudes = {}
            # Whoever the line brings in to attack is hostile to the party, unasked (build56: the drowned thing,
            # asked, could come out neutral or friendly, and the seat had no one to strike).
            dispositions = dict(getattr(chat, "dispositions", None) or {})
            attacking = [one for one in attackers(said, named) if one not in pcs and not dispositions.get(one)]
            for one in attacking:
                dispositions[one] = {"party": "hostile"}
            stances, stance_asked = combat_stances(
                named,
                pcs,
                dispositions,
                attitudes if isinstance(attitudes, dict) else {},
                [one["id"] for one in named if _named(said, one) and one["id"] not in attacking],
            )
            stood = await chats._decide("Combat: disposition", asked, said, stance_asked) if stance_asked else None
            fighting = answered_stances(stances, stood, stance_asked, pcs)
            opening: dict[str, Any] = {"scene_id": str(scene["id"]) if scene else None, "person_ids": people}
            takes = inspect.signature(start).parameters if start is not None else {}
            if fighting and "dispositions" in takes:
                # Only what the VTT can't read itself: the story's stances and the wiki's current attitude (it
                # reads the wiki's default rows on its own).
                opening["dispositions"] = {
                    who: {"disposition": str(stance["stance"]), "hostile_to": list(stance["hostile_to"])}
                    for who, stance in fighting.items()
                }
            elif fighting and "sides" in takes:
                opening["sides"] = {who: str(stance["stance"]) for who, stance in fighting.items()}
            made = await _called(start, requester, wiki, **opening)
            encounter_id = str(made.get("id") or made.get("encounter_id") or "") if isinstance(made, dict) else ""
            if not encounter_id:
                return CombatCheckEnvelope(combat_check=CombatCheck(started=False, reason="the VTT opened no fight"))
            if isinstance(made, dict) and made.get("status") == "running":
                # The VTT starts a fight at once (initiative rolled, round 1 begun): what's left are the stances it
                # couldn't settle, put to the decision model among its own options.
                in_line = [one["id"] for one in named if _named(said, one)]
                settled_order = await self._open_choices(asked, said, encounter_id, made, requester, pcs, in_line)
                return CombatCheckEnvelope(
                    combat_check=CombatCheck(started=True, encounter_id=encounter_id, order=settled_order)
                )
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
            if order.get("open_choices") and waiting is None:
                in_line = [one["id"] for one in named if _named(said, one)]
                order = await self._open_choices(asked, said, encounter_id, order, requester, pcs, in_line)
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

    async def _open_choices(
        self,
        asked: Any,
        said: str,
        encounter_id: str,
        order: dict[str, Any],
        requester: str,
        party: Sequence[str] = (),
        in_line: Sequence[str] = (),
    ) -> dict[str, Any]:
        """The VTT's open_choices settled by the decision model among its options, each through set_disposition;
        the order as it stands after."""
        from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import AIChatManager
        from zephyrex.extensions.ai_chat.CombatTurn import defaulted_choices, open_questions, settled

        choices = [one for one in order.get("open_choices") or [] if isinstance(one, dict)]
        setting = loaded_ability(self.model_registry, "rpg_combat", "set_disposition")
        questions = open_questions(choices)
        if not questions or setting is None:
            return order
        # The party never turns on itself and a bystander stays out, without a model call; only the people the
        # line names are asked.
        preset = defaulted_choices(choices, party, in_line)
        asking = {key: question for key, question in questions.items() if key not in preset}
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        decided = await chats._decide("Combat: disposition", asked, said, asking) if asking else {}
        answers = {**preset, **(decided or {})}
        hostile_now = {
            str(one.get("person_id")): [str(other) for other in one.get("hostile_to") or []]
            for one in order.get("combatants") or []
            if isinstance(one, dict) and one.get("person_id")
        }
        for call in settled(choices, answers, hostile_now):
            try:
                answered = await _called(
                    setting,
                    requester,
                    encounter_id,
                    call["person_id"],
                    disposition=call["disposition"],
                    hostile_to=call["hostile_to"],
                )
            except HTTPException:
                continue
            if isinstance(answered, dict):
                order = answered
                hostile_now[call["person_id"]] = list(call["hostile_to"])
        return order

    async def _turned(self, asked: Any, chat: Any, wiki: str, order: dict[str, Any], requester: str) -> dict[str, Any]:
        """Mid-fight, each combatant the latest line names asked how they stand now; one the answer turns is
        moved by the VTT's set_disposition (hostile: against the party; otherwise toward no one)."""
        from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import AIChatManager, ChatMessageManager, shown_text
        from zephyrex.extensions.ai_chat.CombatTurn import COMBAT
        from zephyrex.extensions.ai_chat.MapStep import _named

        setting = loaded_ability(self.model_registry, "rpg_combat", "set_disposition")
        if setting is None or not getattr(asked, "leaf_id", None):
            return order
        try:
            line = ChatMessageManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.leaf_id)
        except HTTPException:
            return order
        said = shown_text(line)
        combatants = [one for one in order.get("combatants") or [] if isinstance(one, dict) and one.get("person_id")]
        from zephyrex.extensions.ai_chat.WikiReads import world_entities_by_id

        ids = [str(one["person_id"]) for one in combatants]
        rows = {str(row["id"]): row for row in world_entities_by_id(self.model_registry, requester, ids)}
        # The party as at the start: PCs, and (until the wiki carries a person's kind) the chat's cast not now hostile.
        members = {str(one) for one in getattr(chat, "character_ids", None) or []}
        party = [
            str(one["person_id"])
            for one in combatants
            if _is_pc(rows.get(str(one["person_id"])) or {})
            or (str(one["person_id"]) in members and one.get("disposition") != "hostile")
        ]
        named = [one for one in combatants if _named(said, {"name": one.get("name") or ""})]
        named = [one for one in named if str(one["person_id"]) not in party]
        if not named:
            return order
        questions = {
            f"disposition_{one['person_id']}": {
                "type": "choice",
                "instructions": str(COMBAT["disposition_question"])
                .replace("{{name}}", str(one.get("name") or ""))
                .replace(
                    "{{known}}",
                    str(COMBAT["disposition_known"]).replace("{{stances}}", str(one.get("disposition") or "neutral")),
                ),
                "criteria": dict(COMBAT["stances"]),
            }
            for one in named
        }
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        answers = await chats._decide("Combat: disposition", asked, said, questions)
        for one in named:
            picked = ((answers or {}).get(f"disposition_{one['person_id']}") or {}).get("choice")
            if picked not in COMBAT["stances"] or picked == one.get("disposition"):
                continue
            try:
                answered = await _called(
                    setting,
                    requester,
                    str(order["id"]),
                    str(one["person_id"]),
                    disposition=str(picked),
                    hostile_to=party if picked == "hostile" else [],
                )
            except HTTPException:
                continue
            if isinstance(answered, dict):
                order = answered
        return order


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
        line_text = ""
        if asked.line_id:
            from zephyrex.extensions.ai_chat.BLL_AI_Chat import ChatMessageManager, shown_text

            said = ChatMessageManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.line_id)
            if str(said.chat_id) != asked.chat_id:
                raise HTTPException(
                    status_code=422, detail={"message": "The line must be in the chat", "code": "validation_error"}
                )
            line_text = shown_text(said)
        by_line = bool(asked.line_id)
        questions, by_action, by_target = combat_questions(options, name, str(person.get("summary") or ""), by_line)
        if not questions:
            await passed()
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="no action"))
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        state = f"{name}, {options.get('hp')}/{options.get('hp_max')} hit points, in a fight against: " + ", ".join(
            f"{one.get('name')} ({'hostile' if one.get('hostile') else 'friendly'}, {one.get('hp')} hit points)"
            for one in options.get("targets") or []
        )
        if by_line:
            state = f"{state}\n\n{name}'s player: {line_text}"
        answers = await chats._decide("Combat: person's turn" if by_line else "Combat: turn", asked, state, questions)
        if answers is None:
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="no decision model"))
        pick = combat_pick(answers, options, by_action, by_target)
        if pick is None and by_line:
            # Their line describes none of the options: the turn stays theirs, for them to say again.
            return CombatTurnEnvelope(combat_turn=CombatTurn(acted=False, reason="the line describes no action"))
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
