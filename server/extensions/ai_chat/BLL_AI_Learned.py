# SPDX-License-Identifier: AGPL-3.0-or-later
"""What a scene reveals to the party, kept in the wiki (the operator's "learned facts" in the player's drawer;
the wiki's learn_fact, 60b18a2).

``POST /v1/ai_chat/learned`` ``{"learned": {"chat_id", "leaf_id"}}``: for each PC on the campaign's current
scene and each world entity the line names, the decision model says whether that PC now knows of it
(LearnedFacts.py; purpose "learned_facts", background work), and each yes is a knows-of record through
learn_fact. Answers ``{learned: [{person_id, target_entity_type, target_entity_id, created}]}``. The client
calls it after a line is saved, without waiting on it.
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


class LearnedRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    leaf_id: str = Field(..., min_length=1)


class LearnedRequestEnvelope(PlainModel):
    learned: LearnedRequest


class Learned(PlainModel):
    learned: list[dict[str, Any]] = Field(default_factory=list)


class LearnedEnvelope(PlainModel):
    learned: Learned


class LearnedManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager)."""

    prefix: ClassVar[str | None] = "/v1/ai_chat/learned"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=LearnedRequestEnvelope,
        output_model=LearnedEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="What a line reveals to the PCs on the scene, kept as their known facts in the wiki (learn_fact)",
    )
    async def learned_route(self, body: LearnedRequestEnvelope) -> LearnedEnvelope:
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
        from zephyrex.extensions.ai_chat.LearnedFacts import learn_questions, learned  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import (  # type: ignore[import-not-found]
            scene_people,
            world_entities_by_id,
            world_entities_page,
        )

        asked = body.learned
        requester = str(self.requester.id)
        chat = ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.chat_id)
        line = ChatMessageManager(requester_id=requester, model_registry=self.model_registry).get(id=asked.leaf_id)
        if str(line.chat_id) != str(chat.id):
            raise HTTPException(
                status_code=422, detail={"message": "The line must be in the chat", "code": "validation_error"}
            )
        wiki = wiki_campaign_for(
            CampaignFrameManager(requester_id=requester, model_registry=self.model_registry), chat.campaign_id
        )
        learn = loaded_ability(self.model_registry, "rpg_core", "learn_fact")
        if not wiki or learn is None:
            return LearnedEnvelope(learned=Learned())
        here = await scene_people(self.model_registry, requester, wiki) or []
        pcs = [
            {"id": str(row["id"]), "name": str(row.get("name") or "")}
            for row in world_entities_by_id(self.model_registry, requester, list(here))
            if row.get("kind") == "pc" and row.get("name")
        ]
        entities = [
            {**row, "aliases": list(row.get("aliases") or [])}
            for row in world_entities_page(self.model_registry, requester, wiki) or []
            if row.get("name") and not row.get("deleted") and not row.get("canon")
        ]
        said = shown_text(line)
        questions, about = learn_questions(said, pcs, entities)
        if not questions:
            return LearnedEnvelope(learned=Learned())
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        answers = await chats._decide("learned_facts", asked, said, questions)
        kept: list[dict[str, Any]] = []
        for fact in learned(answers, about):
            try:
                made = learn(self.model_registry, requester, text=None, learned_in=None, **fact)
                made = await made if inspect.isawaitable(made) else made
            except HTTPException:
                continue
            kept.append({**fact, "created": bool(made.get("created")) if isinstance(made, dict) else False})
        return LearnedEnvelope(learned=Learned(learned=kept))
