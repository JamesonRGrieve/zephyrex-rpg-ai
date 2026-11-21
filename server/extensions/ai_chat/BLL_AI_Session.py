# SPDX-License-Identifier: AGPL-3.0-or-later
"""A campaign's sessions (docs/DESIGN.md, The play model; the operator, 2026-11-21).

Sessions are segments of a campaign's story, "save points, essentially": each starts at a message
of the campaign's tree and, once ended, carries its summary, which later sessions read instead of
its lines (Play.py). /v1/chat_session, owned through the chat it belongs to. The lite twin is
client/src/lib/sessionRecords.ts.
"""

from datetime import datetime
from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import Field
from zephyrex.extensions.ai_character.Contract import LIMITS  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BLL_AI_Chat import ChatManager, ChatMessageManager  # type: ignore[import-not-found]
from zephyrex.logic.AbstractLogicManager import (
    AbstractBLLManager,
    ApplicationModel,
    ModelMeta,
    StringSearchModel,
    UpdateMixinModel,
)
from zephyrex.pydantic2.fastapi import RouterMixin

# The framework's registry BaseModel, which it re-exports without declaring it.
from zephyrex.pydantic2.registry import BaseModel  # type: ignore[attr-defined]

MAX_TITLE: int = LIMITS["chat_title_characters"]
MAX_SUMMARY: int = LIMITS["chat_summary_characters"]


class ChatSessionModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ChatSessionManager"]]
    chat_id: str = Field(..., description="The campaign (its story's chat)")
    number: int = Field(..., description="1 for the first session, and on")
    title: str = Field("", description="A name for the session (blank: 'Session n')")
    start_message_id: str = Field(..., description="The session's first message in the story tree")
    summary: str = Field("", description="What happened, written when the session ends")
    ended_at: datetime | None = Field(None, description="When it ended (null: still being played)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI campaign sessions"

    class Create(BaseModel):
        chat_id: str = Field(..., min_length=1)
        number: int = Field(..., ge=1)
        title: str = Field("", max_length=MAX_TITLE)
        start_message_id: str = Field(..., min_length=1)
        summary: str = Field("", max_length=MAX_SUMMARY)
        ended_at: datetime | None = None

    class Update(BaseModel):
        title: str | None = Field(None, max_length=MAX_TITLE)
        summary: str | None = Field(None, max_length=MAX_SUMMARY)
        ended_at: datetime | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None


class ChatSessionManager(AbstractBLLManager[ChatSessionModel], RouterMixin):
    _model = ChatSessionModel

    def _refused(self, field: str, message: str) -> HTTPException:
        return HTTPException(
            status_code=422,
            detail={
                "message": "Validation error",
                "code": "validation_error",
                "errors": [{"loc": [field], "msg": message}],
            },
        )

    def create(self, **kwargs: Any) -> Any:
        requester = str(self.requester.id)
        try:
            ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=kwargs["chat_id"])
        except HTTPException as error:
            raise self._refused("chat_id", "The chat must be one of yours") from error
        messages = ChatMessageManager(requester_id=requester, model_registry=self.model_registry)
        if not any(message.id == kwargs["start_message_id"] for message in messages.list(chat_id=kwargs["chat_id"])):
            raise self._refused("start_message_id", "The session must start at a message of its chat")
        kwargs.setdefault("title", "")
        kwargs.setdefault("summary", "")
        return super().create(**kwargs)


class CampaignPlayModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    """A campaign's play state: the chat holding its story is a campaign, not a sandbox chat."""

    Manager: ClassVar[type["CampaignPlayManager"]]
    chat_id: str = Field(..., description="The campaign's story (its chat); one play state each")
    playing_id: str | None = Field(None, description="The character the person plays (null: the GM's seat)")
    forked_from_id: str | None = Field(None, description="The campaign it was forked from")
    forked_at_message_id: str | None = Field(None, description="The message it was forked at")

    table_comment: ClassVar[str] = "Zephyrex RPG AI campaign play state"

    class Create(BaseModel):
        chat_id: str = Field(..., min_length=1)
        playing_id: str | None = None
        forked_from_id: str | None = None
        forked_at_message_id: str | None = None

    class Update(BaseModel):
        playing_id: str | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None


class CampaignPlayManager(AbstractBLLManager[CampaignPlayModel], RouterMixin):
    _model = CampaignPlayModel

    def create(self, **kwargs: Any) -> Any:
        try:
            chats = ChatManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
            chats.get(id=kwargs["chat_id"])
        except HTTPException as error:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Validation error",
                    "code": "validation_error",
                    "errors": [{"loc": ["chat_id"], "msg": "The chat must be one of yours"}],
                },
            ) from error
        if super().list(chat_id=kwargs["chat_id"]):
            raise HTTPException(
                status_code=409, detail={"message": "That chat is already a campaign", "code": "conflict"}
            )
        return super().create(**kwargs)


def play_context(requester_id: str, model_registry: Any, chat_id: str) -> tuple[str | None, list[dict[str, Any]]]:
    """A chat's play state for a reply (Play.py): whom the person plays, and its sessions' marks."""
    plays = CampaignPlayManager(requester_id=requester_id, model_registry=model_registry).list(chat_id=chat_id)
    sessions = ChatSessionManager(requester_id=requester_id, model_registry=model_registry).list(chat_id=chat_id)
    marks = [
        {"number": session.number, "start_message_id": session.start_message_id, "summary": session.summary or ""}
        for session in sessions
    ]
    return (plays[0].playing_id if plays else None), marks
