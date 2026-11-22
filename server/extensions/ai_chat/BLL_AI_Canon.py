# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canon warnings over the API (docs/DESIGN.md, Canon warnings; Canon.py holds the rules).

``POST /v1/canon_check`` ``{"canon_check": {"chat_id", "text", "speaker"}}``: the line is put to the
person's decision model (the decide role) with the canon in reach (the chat's lore entries whose
keys the line names, its frame's truths, its campaign's earlier sessions), and answered with the
notice: ``none``, ``yellow`` or ``red``, the fact it conflicts with, and why. With no decision
model it answers ``none`` and ``checked: false``. The lite twin is app/api/v1/canon_check.
"""

from __future__ import annotations

import re
from typing import Any, ClassVar

from pydantic import BaseModel as PlainModel
from pydantic import Field
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.lib.SecretEncryption import decrypt_secret
from zephyrex.logic.AbstractLogicManager import AbstractBLLManager
from zephyrex.pydantic2.fastapi import AuthType, RouterMixin, RouteType


class CanonCheckRequest(PlainModel):
    chat_id: str
    text: str = Field(..., min_length=1, max_length=20000)
    speaker: str = Field("The GM", max_length=200, description="Who says the line")


class CanonCheckEnvelope(PlainModel):
    canon_check: CanonCheckRequest


class CanonVerdict(PlainModel):
    level: str
    fact: str | None
    reason: str
    checked: bool


class CanonVerdictEnvelope(PlainModel):
    canon_check: CanonVerdict


def facts_in_reach(
    text: str, entries: list[Any], truths: list[str], summaries: list[tuple[int, str]], limit: int
) -> list[dict[str, str]]:
    """The canon the line is checked against: lore it names, the frame's truths, earlier sessions."""
    named = []
    lowered = text.lower()
    for entry in entries:
        keys = [key for key in (entry.keys or []) if key.strip()]
        if any(re.search(rf"(?<!\w){re.escape(key.lower())}(?!\w)", lowered) for key in keys):
            named.append({"title": entry.comment or keys[0], "text": entry.content or ""})
    facts = named + [{"title": f"Truth {index + 1}", "text": truth} for index, truth in enumerate(truths)]
    facts += [{"title": f"Session {number}", "text": summary} for number, summary in summaries if summary.strip()]
    return facts[:limit]


class CanonCheckManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager): a check reads records of other managers."""

    prefix: ClassVar[str | None] = "/v1/canon_check"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=CanonCheckEnvelope,
        output_model=CanonVerdictEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A line checked against canon: none, yellow (likely contravenes it) or red (flagrantly breaks it)",
    )
    async def check_route(self, body: Any) -> CanonVerdictEnvelope:
        from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
            CampaignFrameManager,
            frame_for,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import (  # type: ignore[import-not-found]
            ChatManager,
            ModelEndpointManager,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Session import ChatSessionManager  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.Canon import _CASES, canon_questions, canon_state, canon_verdict  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.Decide import ask_decider  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_lorebook.BLL_AI_Lorebook import LorebookEntryManager  # type: ignore[import-not-found]

        envelope = body if isinstance(body, CanonCheckEnvelope) else CanonCheckEnvelope.model_validate(body)
        asked = envelope.canon_check
        requester = str(self.requester.id)

        def manager(cls: Any) -> Any:
            return cls(requester_id=requester, model_registry=self.model_registry)

        chat = manager(ChatManager).get(id=asked.chat_id)
        deciding = next((row for row in manager(ModelEndpointManager).list() if "decide" in (row.roles or [])), None)
        # A campaign that breaks canon on purpose turns its warnings off (the chat's canon_checks).
        if deciding is None or getattr(chat, "canon_checks", True) is False:
            return CanonVerdictEnvelope(canon_check=CanonVerdict(level="none", fact=None, reason="", checked=False))
        entries = [
            entry
            for book_id in chat.lorebook_ids or []
            for entry in manager(LorebookEntryManager).list(lorebook_id=book_id)
            if entry.enabled
        ]
        # A playthrough's frame, or none (a wiki campaign without one): never a 404.
        frame = frame_for(manager(CampaignFrameManager), chat.campaign_id)
        sessions = manager(ChatSessionManager).list(chat_id=chat.id)
        facts = facts_in_reach(
            asked.text,
            entries,
            list(getattr(frame, "truths", None) or []),
            [(session.number, session.summary or "") for session in sessions],
            _CASES["max_facts"],
        )
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            canon_state(asked.speaker, asked.text, facts),
            canon_questions(facts),
        )
        if answers is None:
            return CanonVerdictEnvelope(canon_check=CanonVerdict(level="none", fact=None, reason="", checked=False))
        verdict = canon_verdict(answers, facts)
        return CanonVerdictEnvelope(canon_check=CanonVerdict(**verdict, checked=True))
