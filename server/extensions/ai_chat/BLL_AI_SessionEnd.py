# SPDX-License-Identifier: AGPL-3.0-or-later
"""Ending a session (A24): when the AI GM runs the game, the session report is written into the
wiki's campaign log when someone presses "End session" (the operator, 2026-11-21: only a button).

``POST /v1/session_end`` ``{"session_end": {"chat_id"}}``: the chat's story lines (never its table
talk, nor what the table X-carded) go to the model serving summaries with the report instructions
(SessionReport's twin of the lite sessionReport.ts); the report is written through the wiki's
``session_report`` ability into the wiki campaign the chat's frame is linked to, naming the world
entities the report mentions. 422 when the chat has no frame linked to a wiki campaign; 409 when
the wiki isn't loaded beside this app.
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.logic.AbstractLogicManager import AbstractBLLManager
from zephyrex.pydantic2.fastapi import AuthType, RouterMixin, RouteType

# Entities read to find what the report names: pages of the wiki's world_entities, at most this many.
WORLD_PAGES = 20
WORLD_PAGE_SIZE = 500


class SessionEndRequest(PlainModel):
    chat_id: str


class SessionEndEnvelope(PlainModel):
    session_end: SessionEndRequest


class SessionEnded(PlainModel):
    report_id: str
    title: str
    mentions: int


def report_lines(
    history: list[dict[str, Any]], cast: list[dict[str, Any]], persona: Any, story: list[str]
) -> list[dict[str, str]]:
    """The branch as the report reads it: each turn's speaker and text, story turns marked as such."""
    names = {str(member["id"]): str(member["name"]) for member in cast}
    user = str(persona["name"]) if isinstance(persona, dict) and persona.get("name") else "The player"
    lines: list[dict[str, str]] = []
    for turn in history:
        if turn.get("x_carded"):
            continue
        if turn["role"] == "user":
            speaker = user
        elif turn["role"] == "character":
            speaker = names.get(str(turn.get("speaker_character_id") or ""), "The narrator")
        else:
            speaker = "The narrator"
        channel = "story" if turn["channel"] in story else "table"
        lines.append({"channel": channel, "speaker": speaker, "text": str(turn["content"])})
    return lines


class SessionEndManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager): a session ends over records of other managers."""

    prefix: ClassVar[str | None] = "/v1/session_end"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    async def _world_entities(self, ability: Any, campaign_id: str) -> list[dict[str, Any]]:
        entities: list[dict[str, Any]] = []
        after = None
        for _ in range(WORLD_PAGES):
            page = ability(
                self.model_registry, str(self.requester.id), campaign_id, since=None, after=after, limit=WORLD_PAGE_SIZE
            )
            if inspect.isawaitable(page):
                page = await page
            entities += [entity for entity in page["world_entities"] if not entity.get("deleted")]
            after = page.get("next")
            if after is None:
                break
        return entities

    @custom_route(
        method="POST",
        path="",
        input_model=SessionEndEnvelope,
        output_model=SessionEnded,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="End the session: its report written into the linked wiki campaign's log (A24)",
    )
    async def end_route(self, body: Any) -> SessionEnded:
        from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
            CampaignFrameManager,
        )
        from zephyrex.extensions.ai_campaign.SessionReport import (  # type: ignore[import-not-found]
            report_mentions,
            report_prompt,
        )
        from zephyrex.extensions.ai_character.Contract import PROMPT  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import (  # type: ignore[import-not-found]
            AIChatManager,
            ChatManager,
            ChatMessageManager,
            GenerateRequest,
        )

        envelope = SessionEndEnvelope.model_validate(body) if not isinstance(body, SessionEndEnvelope) else body
        chat_id = envelope.session_end.chat_id
        requester = str(self.requester.id)
        chat = ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=chat_id)
        frame = (
            CampaignFrameManager(requester_id=requester, model_registry=self.model_registry).get(id=chat.campaign_id)
            if chat.campaign_id
            else None
        )
        wiki_campaign_id = getattr(frame, "wiki_campaign_id", None) if frame is not None else None
        if not wiki_campaign_id:
            raise HTTPException(
                status_code=422,
                detail={"message": "Link this chat's campaign to a wiki campaign first", "code": "no_wiki_campaign"},
            )
        write = loaded_ability(self.model_registry, "rpg_core", "session_report")
        read_world = loaded_ability(self.model_registry, "rpg_core", "world_entities")
        if write is None or read_world is None:
            raise HTTPException(status_code=409, detail={"message": "The wiki isn't loaded", "code": "no_wiki"})

        # The session is the branch up to the chat's newest line (the one the table last played).
        messages = ChatMessageManager(requester_id=requester, model_registry=self.model_registry).list(chat_id=chat_id)
        if not messages:
            raise HTTPException(
                status_code=422, detail={"message": "Nothing happened in the story yet", "code": "empty_session"}
            )
        leaf = max(messages, key=lambda message: (str(message.created_at), str(message.id)))
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        _assembled, _request, sampler, _active, context = chats._inputs(
            GenerateRequest(chat_id=chat_id, leaf_id=str(leaf.id)), save_timers=False, purpose="summary"
        )
        story_channels = list(PROMPT["story_channels"])
        lines = report_lines(context["history"], context["cast"], context["persona"], story_channels)
        if not any(line["channel"] == "story" for line in lines):
            raise HTTPException(
                status_code=422, detail={"message": "Nothing happened in the story yet", "code": "empty_session"}
            )
        text = (await chats._ask(context, dict(sampler), report_prompt(lines))).strip()
        if not text:
            raise HTTPException(
                status_code=502, detail={"message": "The model wrote no report", "code": "empty_report"}
            )

        entities = await self._world_entities(read_world, wiki_campaign_id)
        kinds = {str(entity["id"]): str(entity["kind"]) for entity in entities}
        mentions = [
            {"target_entity_type": kinds[entity_id], "target_entity_id": entity_id}
            for entity_id in report_mentions(text, entities)
        ]
        title = f"{chat.title}: {datetime.now(UTC).strftime('%Y-%m-%d')}"
        written = write(
            self.model_registry,
            requester,
            campaign_id=wiki_campaign_id,
            title=title,
            body=text,
            occurred_at=datetime.now(UTC),
            mentions=mentions,
        )
        if inspect.isawaitable(written):
            written = await written
        return SessionEnded(report_id=str(written["id"]), title=title, mentions=len(mentions))
