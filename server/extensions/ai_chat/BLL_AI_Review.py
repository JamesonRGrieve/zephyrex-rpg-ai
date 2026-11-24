# SPDX-License-Identifier: AGPL-3.0-or-later
"""What produced a line, kept for review (the operator, 2026-11-23).

- **Decision calls** (decision_calls): each call to a decision model, with what was asked, a summary of
  the scene it read, what came back, the model and how long it took, kept against the message it was
  about, so the client stacks them under it ("The decision calls are shown").
- **Generation snapshots** (generation_snapshots): a reply's request as it was sent to the model (the
  prompt, the model, the sampler), kept against the message it answered.
- **Message feedback** (message_feedbacks): "on any message the person marks what went wrong (a reason
  and a note). It is stored with the full context that produced the line", so each instance can be
  examined in context. Not RLHF: for manual review (GET /v1/message_feedback).

Each is owned through its chat, as a session is.
"""

from __future__ import annotations

from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import Field
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

#: The scene a decision model read, as kept: its first characters.
STATE_CHARACTERS = 600
#: What feedback may say.
REASON_CHARACTERS = 200
NOTE_CHARACTERS = 4000


def _refused(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "message": "Validation error",
            "code": "validation_error",
            "errors": [{"loc": [field], "msg": message}],
        },
    )


def _own_chat(manager: Any, chat_id: str) -> None:
    try:
        ChatManager(requester_id=str(manager.requester.id), model_registry=manager.model_registry).get(id=chat_id)
    except HTTPException as error:
        raise _refused("chat_id", "The chat must be one of yours") from error


class DecisionCallModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type[DecisionCallManager]]
    chat_id: str = Field(..., description="The chat the decision was made in")
    message_id: str | None = Field(None, description="The message it was about (null: the chat as a whole)")
    purpose: str = Field(..., description="What it decided: roll, clarify, next_turn, label_lines, canon…")
    questions: list[dict[str, Any]] = Field(default_factory=list, description="Each question: key, type, instructions")
    state: str = Field("", description="The start of the scene it read")
    answers: dict[str, Any] = Field(default_factory=dict, description="What came back, per question (null: refused)")
    model: str = Field("", description="The decision model asked")
    ms: int = Field(0, description="How long the call took, in milliseconds")
    error: dict[str, Any] | None = Field(
        None, description="Why the call gave nothing: kind (timeout, unreachable, http, parse, empty) and detail"
    )
    status: str = Field("done", description="running while asked, then done or failed")
    attempt: int = Field(1, description="Which try this was (a retry is its own record)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI decision model calls"

    class Create(BaseModel):
        chat_id: str = Field(..., min_length=1)
        message_id: str | None = None
        purpose: str = Field(..., min_length=1, max_length=64)
        questions: list[dict[str, Any]] = Field(default_factory=list)
        state: str = Field("", max_length=STATE_CHARACTERS)
        answers: dict[str, Any] = Field(default_factory=dict)
        model: str = Field("", max_length=200)
        ms: int = Field(0, ge=0)
        error: dict[str, Any] | None = None
        status: str = Field("done", pattern="^(running|done|failed)$")
        attempt: int = Field(1, ge=1)

    class Update(BaseModel):
        message_id: str | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None
        message_id: StringSearchModel | None = None


class DecisionCallManager(AbstractBLLManager[DecisionCallModel], RouterMixin):
    _model = DecisionCallModel

    def create(self, **kwargs: Any) -> Any:
        _own_chat(self, kwargs["chat_id"])
        return super().create(**kwargs)


class GenerationSnapshotModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type[GenerationSnapshotManager]]
    chat_id: str = Field(..., description="The chat")
    leaf_id: str = Field(..., description="The message the reply answered")
    mode: str = Field("", description="The turn's mode (narrate, a voice, table…)")
    model: str = Field("", description="The model it was sent to")
    endpoint_id: str | None = Field(None, description="The endpoint it was sent to")
    request: dict[str, Any] = Field(default_factory=dict, description="The request as sent: messages and sampler")

    table_comment: ClassVar[str] = "Zephyrex RPG AI replies' requests as sent"

    class Create(BaseModel):
        chat_id: str = Field(..., min_length=1)
        leaf_id: str = Field(..., min_length=1)
        mode: str = Field("", max_length=32)
        model: str = Field("", max_length=200)
        endpoint_id: str | None = None
        request: dict[str, Any] = Field(default_factory=dict)

    class Update(BaseModel):
        mode: str | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None
        leaf_id: StringSearchModel | None = None


class GenerationSnapshotManager(AbstractBLLManager[GenerationSnapshotModel], RouterMixin):
    _model = GenerationSnapshotModel

    def create(self, **kwargs: Any) -> Any:
        _own_chat(self, kwargs["chat_id"])
        return super().create(**kwargs)


VERDICTS = ("bad", "good")


class MessageFeedbackModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type[MessageFeedbackManager]]
    chat_id: str = Field(..., description="The chat (the message's own)")
    message_id: str = Field(..., description="The message marked")
    verdict: str = Field(..., description="bad or good")
    reason: str = Field("", description="What went wrong, in a few words")
    note: str = Field("", description="More, if the person wants")
    snapshot: dict[str, Any] = Field(
        default_factory=dict,
        description="What produced the line: its text, the request as sent (prompt, model, sampler) and the "
        "decision calls about it and its parent",
    )

    table_comment: ClassVar[str] = "Zephyrex RPG AI per-message feedback, for manual review"

    class Create(BaseModel):
        message_id: str = Field(..., min_length=1)
        verdict: str = Field(..., pattern="^(bad|good)$")
        reason: str = Field("", max_length=REASON_CHARACTERS)
        note: str = Field("", max_length=NOTE_CHARACTERS)
        # chat_id and snapshot are the manager's alone (the message's chat, and what produced the line): set
        # through trusted_fields, never accepted from the caller.

    class Update(BaseModel):
        verdict: str | None = Field(None, pattern="^(bad|good)$")
        reason: str | None = Field(None, max_length=REASON_CHARACTERS)
        note: str | None = Field(None, max_length=NOTE_CHARACTERS)

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None
        message_id: StringSearchModel | None = None


class MessageFeedbackManager(AbstractBLLManager[MessageFeedbackModel], RouterMixin):
    _model = MessageFeedbackModel

    def create(self, **kwargs: Any) -> Any:
        """Feedback kept with what produced the line: taken now, from the snapshot of the reply's request
        and the decision calls about the message and the line it answered."""
        requester = str(self.requester.id)
        messages = ChatMessageManager(requester_id=requester, model_registry=self.model_registry)
        try:
            found = messages.get(id=kwargs["message_id"])
        except HTTPException as error:
            raise _refused("message_id", "The message must be one of yours") from error
        kwargs["chat_id"] = str(found.chat_id)
        _own_chat(self, kwargs["chat_id"])
        swipes = list(found.swipes or [])
        text = str(swipes[found.swipe_index]) if 0 <= found.swipe_index < len(swipes) else ""
        about = [kwargs["message_id"], *([found.parent_id] if found.parent_id else [])]
        snapshots = GenerationSnapshotManager(requester_id=requester, model_registry=self.model_registry).list(
            chat_id=kwargs["chat_id"]
        )
        sent = max(
            (one for one in snapshots if found.parent_id and one.leaf_id == found.parent_id),
            key=lambda one: str(one.created_at),
            default=None,
        )
        calls = DecisionCallManager(requester_id=requester, model_registry=self.model_registry).list(
            chat_id=kwargs["chat_id"]
        )
        kwargs["snapshot"] = {
            "text": text,
            "swipes": swipes,
            "line_labels": getattr(found, "line_labels", None),
            "role": found.role,
            "speaker_character_id": found.speaker_character_id,
            "request": (
                {"model": sent.model, "endpoint_id": sent.endpoint_id, "mode": sent.mode, **dict(sent.request or {})}
                if sent is not None
                else None
            ),
            "decisions": [
                {
                    "message_id": call.message_id,
                    "purpose": call.purpose,
                    "questions": call.questions,
                    "state": call.state,
                    "answers": call.answers,
                    "model": call.model,
                    "ms": call.ms,
                    "error": getattr(call, "error", None),
                }
                for call in calls
                if call.message_id in about
            ],
        }
        kwargs.setdefault("note", "")
        kwargs.setdefault("reason", "")
        # The framework's trusted create (server-framework ac86cc4): the fields Create doesn't take, set here.
        with self.trusted_fields("chat_id", "snapshot"):
            return super().create(**kwargs)
