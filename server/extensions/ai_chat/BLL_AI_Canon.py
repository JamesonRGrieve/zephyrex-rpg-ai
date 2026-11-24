# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canon warnings over the API (docs/DESIGN.md, Canon warnings; Canon.py holds the rules).

``POST /v1/canon_check`` ``{"canon_check": {"chat_id", "text", "speaker"}}``: the line is put to the
person's decision model (the decide role) with the canon in reach (the chat's lore entries whose
keys the line names, its frame's truths, its campaign's earlier sessions), and answered with the
notice: ``none``, ``yellow`` or ``red``, the fact it conflicts with in its record's own words, and why:
the chat's summary model says what specifically differs (the operator, 2026-11-22: "I need WHY!"), and a
flag it can't make specific is no notice. With no decision model it answers ``none`` and
``checked: false``. The lite twin is app/api/v1/canon_check.
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
    #: The fact in its record's own words: its name and the sentence the line contradicts.
    fact: str | None
    #: What specifically differs, e.g. "Mags is the barkeep of the Leaning Lantern in the scenario; this
    #: line has her running the Split Antler."
    reason: str
    checked: bool
    #: The wiki record the fact is, when it is one.
    record_name: str | None = None
    record_id: str | None = None


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
            AIChatManager,
            ChatManager,
            ModelEndpointManager,
            wiki_campaign_for,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Session import ChatSessionManager  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.Canon import (  # type: ignore[import-not-found]
            _CASES,
            canon_notice,
            canon_questions,
            canon_state,
            canon_verdict,
        )
        from zephyrex.extensions.ai_chat.WikiReads import world_matching  # type: ignore[import-not-found]
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
        # The wiki records the line names come first (the composed suite's canon: the scenario's people,
        # places and the setting's books), each with its id, then the chat's lore, truths and sessions.
        wiki = wiki_campaign_for(manager(CampaignFrameManager), chat.campaign_id)
        records = [
            {
                "title": str(row.get("name") or ""),
                "id": str(row.get("id") or ""),
                "text": " ".join(
                    str(row.get(key) or "").strip() for key in ("summary", "description", "entry") if row.get(key)
                ),
            }
            for row in world_matching(self.model_registry, requester, wiki, asked.text) or []
            if row.get("name") and not row.get("deleted")
        ]
        facts = [record for record in records if record["text"]] + facts_in_reach(
            asked.text,
            entries,
            list(getattr(frame, "truths", None) or []),
            [(session.number, session.summary or "") for session in sessions],
            _CASES["max_facts"],
        )
        facts = facts[: _CASES["max_facts"]]
        # Through _decide, so the call is kept and shown with the others (the operator, 2026-11-24).
        chats = AIChatManager(requester_id=requester, model_registry=self.model_registry)
        state = canon_state(asked.speaker, asked.text, facts)
        answers = await chats._decide("canon", asked, state, canon_questions(facts))
        if answers is None:
            return CanonVerdictEnvelope(canon_check=CanonVerdict(level="none", fact=None, reason="", checked=False))
        verdict = canon_verdict(answers, facts, asked.text)
        why = await self._why(asked.speaker, asked.text, verdict["fact"]) if verdict["level"] != "none" else None
        return CanonVerdictEnvelope(canon_check=CanonVerdict(**canon_notice(verdict, why), checked=True))

    async def _why(self, speaker: str, line: str, fact: str | None) -> str | None:
        """What specifically differs, in one sentence from the person's summary model (else their default
        chat model); None when there's none to ask, it can't be reached, or it finds no conflict."""
        import httpx
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import ModelEndpointManager
        from zephyrex.extensions.ai_chat.Canon import _CASES, read_why, why_messages
        from zephyrex.extensions.ai_chat.NarratorStyle import traits_of  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.Thinking import thinking_fields  # type: ignore[import-not-found]
        from zephyrex.lib.Logging import logger

        listed = ModelEndpointManager(requester_id=str(self.requester.id), model_registry=self.model_registry).list()
        rows = [row for row in listed if (row.api or "chat") == "chat" and "search" not in (row.roles or [])]
        endpoint = (
            next((row for row in rows if "summary" in (row.roles or [])), None)
            or next((row for row in rows if row.is_default), None)
            or next(iter(rows), None)
        )
        if endpoint is None:
            return None
        traits = traits_of({"model": endpoint.model, "traits": dict(getattr(endpoint, "traits", None) or {})})
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        body = {
            "model": endpoint.model,
            "messages": why_messages(speaker, line, fact),
            "stream": False,
            "max_tokens": int(_CASES["why_max_tokens"]),
            "temperature": 0.2,
            # A thinking model answers this without thinking (it's one sentence).
            **(thinking_fields("off", traits.get("reasoning_effort")) if traits.get("reasoning_effort") else {}),
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                answer = await client.post(
                    f"{endpoint.base_url.rstrip('/')}/chat/completions",
                    headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
                    json=body,
                )
            content = answer.json()["choices"][0]["message"]["content"] if answer.status_code < 400 else None
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            content = None
        logger.info(f"canon_check why from {endpoint.model}: {'answered' if content else 'nothing'}")
        return read_why(content) if isinstance(content, str) else None
