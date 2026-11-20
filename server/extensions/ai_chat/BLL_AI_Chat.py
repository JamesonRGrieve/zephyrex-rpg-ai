# SPDX-License-Identifier: AGPL-3.0-or-later
"""Chats and their generation, on the framework's records (CRUD routes, ETag/If-Match on every
write): the same resources, fields and rules as the lite edition's (client/src/lib/rpgRecords.ts,
client/src/lib/generate.ts).

- ``/v1/chat``: a conversation with characters the owner has, its persona, preset, model and
  author's note.
- ``/v1/chat_message``: a turn in one of the owner's chats. Its alternatives are ``swipes``, the
  shown one ``swipe_index``; ``parent_id`` branches the chat. Listed by ``?chat_id=``. Deleting
  one deletes its branch.
- ``/v1/generation_preset``: sampler settings, inside the contract's ranges.
- ``/v1/model_endpoint``: an OpenAI-compatible endpoint the person brings. Its API key is
  write-only and encrypted at rest; answers say only whether one is set.

Actions on ``/v1/ai_chat``:

- ``POST /generate``: a character's next reply, streamed as server-sent events (``delta``,
  ``done``, ``error``). Out-of-character table talk never reaches the model.
"""

import json
import random
from collections.abc import AsyncIterator, Sequence
from typing import Any, ClassVar

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PlainModel
from pydantic import Field, field_validator, model_validator

# Resolve only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.BLL_AI_Character import (  # type: ignore[import-not-found]
    CharacterManager,
    PersonaManager,
    not_yours,
)
from zephyrex.extensions.ai_character.Contract import (  # type: ignore[import-not-found]
    CHAT_MODES,
    LIMITS,
    MESSAGE_CHANNELS,
    MESSAGE_ROLES,
    PRESET_DEFAULTS,
    SAMPLER_RANGES,
)
from zephyrex.extensions.ai_chat.Lore import activate_lore  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Prompt import assemble_prompt, estimate_tokens  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.Contract import CONTRACT, PROMPT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_lorebook.BLL_AI_Lorebook import (  # type: ignore[import-not-found]
    ChatLoreStateManager,
    LorebookEntryManager,
    LorebookManager,
)
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.lib.EventStream import event_stream
from zephyrex.lib.SecretEncryption import decrypt_secret, encrypt_secret
from zephyrex.logic.AbstractLogicManager import (
    AbstractBLLManager,
    ApplicationModel,
    ModelMeta,
    StringSearchModel,
    UpdateMixinModel,
)
from zephyrex.pydantic2.fastapi import RouterMixin
from zephyrex.pydantic2.fastapi.types import RouteType

# The framework's registry BaseModel, which it re-exports without declaring it.
from zephyrex.pydantic2.registry import BaseModel  # type: ignore[attr-defined]

MAX_NAME: int = LIMITS["name_characters"]
MAX_TITLE: int = LIMITS["chat_title_characters"]
MAX_CAST: int = LIMITS["characters_per_chat"]
MAX_NOTE: int = LIMITS["author_note_characters"]
MAX_MESSAGE: int = LIMITS["message_characters"]
MAX_SWIPES: int = LIMITS["swipes_per_message"]
MAX_STOPS: int = LIMITS["preset_stop_strings"]
MAX_STOP: int = LIMITS["stop_string_characters"]
MAX_URL: int = LIMITS["endpoint_url_characters"]
MAX_MODEL: int = LIMITS["model_name_characters"]
MAX_KEY: int = LIMITS["api_key_characters"]
MAX_BOOKS: int = LIMITS["lorebooks_per_chat"]
LORE: dict[str, Any] = CONTRACT["lore"]
LORE_SETTING_RANGES = {"scan_depth", "token_budget", "recursion_steps"}
LORE_ENTRY_FIELDS = (
    "id", "keys", "secondary_keys", "selective_logic", "content", "enabled", "constant", "position", "depth", "role",
    "order", "probability", "group", "group_weight", "prioritize", "sticky", "cooldown", "delay", "exclude_recursion",
    "prevent_recursion", "delay_until_recursion", "case_sensitive", "match_whole_words", "character_names",
    "character_exclude",
)
UPSTREAM_TIMEOUT_SECONDS = 120.0


def _one_of(value: Any, allowed: Sequence[str], field: str) -> Any:
    if value is not None and value not in allowed:
        raise ValueError(f"{field} is one of {', '.join(allowed)}")
    return value


def _title(value: Any) -> Any:
    if value is None:
        return None
    stripped = str(value).strip()
    if not stripped:
        raise ValueError("A title is required")
    return stripped


def _cast(ids: Any) -> Any:
    if ids is None:
        return None
    if not 1 <= len(ids) <= MAX_CAST:
        raise ValueError(f"A chat has 1 to {MAX_CAST} characters")
    if len(set(ids)) != len(ids):
        raise ValueError("A character is in a chat once")
    return ids


def _lorebook_ids(ids: Any) -> Any:
    if ids is None:
        return None
    if len(ids) > MAX_BOOKS or len(set(ids)) != len(ids):
        raise ValueError(f"At most {MAX_BOOKS} lorebooks, each once")
    return ids


def _prompt_layout(layout: Any) -> Any:
    """The prompt manager's layout (A16): known sections, each at most once, with a budget in range."""
    if layout is None:
        return None
    low, high = PROMPT["section_token_range"]
    seen: set[str] = set()
    for section in layout:
        if not isinstance(section, dict) or set(section) != {"id", "enabled", "max_tokens"}:
            raise ValueError("Each section is {id, enabled, max_tokens}")
        if section["id"] not in PROMPT["sections"] or section["id"] in seen:
            raise ValueError("A section is a known one, in the layout once")
        if not isinstance(section["enabled"], bool):
            raise ValueError("A section's enabled is true or false")
        budget = section["max_tokens"]
        if budget is not None and (isinstance(budget, bool) or not isinstance(budget, int) or not low <= budget <= high):
            raise ValueError(f"A section's max_tokens is null or {low} to {high}")
        seen.add(section["id"])
    return layout


def _lore_settings(settings: Any) -> Any:
    """A chat's World Info settings; what it leaves out takes the contract's defaults."""
    if settings is None:
        return None
    allowed = LORE_SETTING_RANGES | {"case_sensitive", "match_whole_words"}
    if set(settings) - allowed:
        raise ValueError(f"lore_settings takes only {', '.join(sorted(allowed))}")
    for key in LORE_SETTING_RANGES & set(settings):
        low, high = LORE["ranges"][key]
        if not isinstance(settings[key], int) or not low <= settings[key] <= high:
            raise ValueError(f"{key} is a whole number between {low} and {high}")
    for key in {"case_sensitive", "match_whole_words"} & set(settings):
        if not isinstance(settings[key], bool):
            raise ValueError(f"{key} is true or false")
    return settings


def _swipes(swipes: Any) -> Any:
    if swipes is None:
        return None
    if not 1 <= len(swipes) <= MAX_SWIPES:
        raise ValueError(f"A message has 1 to {MAX_SWIPES} swipes")
    if any(not isinstance(swipe, str) or len(swipe) > MAX_MESSAGE for swipe in swipes):
        raise ValueError(f"A swipe is text of at most {MAX_MESSAGE} characters")
    return swipes


def _ranged(setting: str, value: Any) -> Any:
    if value is None:
        return None
    low, high = SAMPLER_RANGES[setting]
    if not low <= value <= high:
        raise ValueError(f"{setting} is between {low} and {high}")
    return value


def _stops(stops: Any) -> Any:
    if stops is None:
        return None
    if len(stops) > MAX_STOPS or any(not isinstance(stop, str) or not 1 <= len(stop) <= MAX_STOP for stop in stops):
        raise ValueError(f"At most {MAX_STOPS} stop strings of 1 to {MAX_STOP} characters")
    return stops


def _base_url(url: Any) -> Any:
    if url is not None and not str(url).startswith(("http://", "https://")):
        raise ValueError("An endpoint is an http or https URL")
    return url


# ---- chat ------------------------------------------------------------------------------


class ChatChecks(PlainModel):
    @field_validator("title", check_fields=False)
    @classmethod
    def _checked_title(cls, value: Any) -> Any:
        return _title(value)

    @field_validator("mode", check_fields=False)
    @classmethod
    def _checked_mode(cls, value: Any) -> Any:
        return _one_of(value, CHAT_MODES, "mode")

    @field_validator("character_ids", check_fields=False)
    @classmethod
    def _checked_cast(cls, value: Any) -> Any:
        return _cast(value)

    @field_validator("lorebook_ids", check_fields=False)
    @classmethod
    def _checked_books(cls, value: Any) -> Any:
        return _lorebook_ids(value)

    @field_validator("lore_settings", check_fields=False)
    @classmethod
    def _checked_lore_settings(cls, value: Any) -> Any:
        return _lore_settings(value)


class ChatModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ChatManager"]]
    title: str = Field(..., description="Title")
    mode: str = Field("character", description="character or group")
    character_ids: list[str] = Field(default_factory=list, description="Who is in it, in turn order")
    persona_id: str | None = Field(None, description="Who the person plays as (null: the default)")
    preset_id: str | None = Field(None, description="Sampler settings (null: the defaults)")
    endpoint_id: str | None = Field(None, description="The model (null: the default)")
    author_note: str = Field("", description="Read close to the end of the chat")
    lorebook_ids: list[str] = Field(default_factory=list, description="The lorebooks it reads")
    lore_settings: dict[str, Any] = Field(default_factory=dict, description="World Info settings")
    system_prompt: str = Field("", description="The chat's own system prompt (blank: the card's)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI chats"

    class Create(BaseModel, ChatChecks):
        title: str = Field(..., min_length=1, max_length=MAX_TITLE)
        mode: str = "character"
        character_ids: list[str] = Field(...)
        persona_id: str | None = None
        preset_id: str | None = None
        endpoint_id: str | None = None
        author_note: str = Field("", max_length=MAX_NOTE)
        lorebook_ids: list[str] = Field(default_factory=list)
        lore_settings: dict[str, Any] = Field(default_factory=dict)
        system_prompt: str = Field("", max_length=LIMITS["chat_system_prompt_characters"])

    class Update(BaseModel, ChatChecks):
        title: str | None = Field(None, min_length=1, max_length=MAX_TITLE)
        mode: str | None = None
        character_ids: list[str] | None = None
        persona_id: str | None = None
        preset_id: str | None = None
        endpoint_id: str | None = None
        author_note: str | None = Field(None, max_length=MAX_NOTE)
        lorebook_ids: list[str] | None = None
        lore_settings: dict[str, Any] | None = None
        system_prompt: str | None = Field(None, max_length=LIMITS["chat_system_prompt_characters"])

    class Search(ApplicationModel.Search):
        title: StringSearchModel | None = None


class ChatManager(AbstractBLLManager[ChatModel], RouterMixin):
    _model = ChatModel

    def _sibling(self, manager: type[Any]) -> Any:
        return manager(requester_id=str(self.requester.id), model_registry=self.model_registry)

    def _owned(self, manager: type[Any], id: str, field: str) -> Any:
        """The record if the requester may use it; the framework's 422 otherwise."""
        try:
            return self._sibling(manager).get(id=id)
        except HTTPException as error:
            raise not_yours(field) from error

    def _check_references(self, fields: dict[str, Any]) -> None:
        for character_id in fields.get("character_ids") or []:
            self._owned(CharacterManager, character_id, "character_ids")
        for book_id in fields.get("lorebook_ids") or []:
            self._owned(LorebookManager, book_id, "lorebook_ids")
        for field, manager in (
            ("persona_id", PersonaManager),
            ("preset_id", GenerationPresetManager),
            ("endpoint_id", ModelEndpointManager),
        ):
            if fields.get(field) is not None:
                self._owned(manager, fields[field], field)

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("mode", "character")
        kwargs.setdefault("author_note", "")
        kwargs.setdefault("lorebook_ids", [])
        kwargs.setdefault("lore_settings", {})
        kwargs.setdefault("system_prompt", "")
        self._check_references(kwargs)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_references(kwargs)
        return super().update(id, **kwargs)

    def delete(self, id: str) -> None:
        # A chat's messages go with it.
        messages = ChatMessageManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        for message in messages.list(chat_id=id):
            ChatMessageManager.delete_one(messages, message.id)
        timers = ChatLoreStateManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        for state in timers.list(chat_id=id):
            timers.delete(state.id)
        super().delete(id)


# ---- chat_message ----------------------------------------------------------------------


class MessageChecks(PlainModel):
    @field_validator("role", check_fields=False)
    @classmethod
    def _checked_role(cls, value: Any) -> Any:
        return _one_of(value, MESSAGE_ROLES, "role")

    @field_validator("channel", check_fields=False)
    @classmethod
    def _checked_channel(cls, value: Any) -> Any:
        return _one_of(value, MESSAGE_CHANNELS, "channel")

    @field_validator("swipes", check_fields=False)
    @classmethod
    def _checked_swipes(cls, value: Any) -> Any:
        return _swipes(value)


class ChatMessageModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ChatMessageManager"]]
    chat_id: str = Field(..., description="The chat")
    parent_id: str | None = Field(None, description="The message it answers (null: the chat's start)")
    role: str = Field(..., description="user, character, narrator or system")
    channel: str = Field("ic", description="ic, ooc, gm, roll or system")
    speaker_character_id: str | None = Field(None, description="The character who speaks it")
    swipes: list[str] = Field(default_factory=list, description="Its alternatives")
    swipe_index: int = Field(0, description="The alternative shown")
    bookmarked: bool = Field(False, description="Bookmarked")

    table_comment: ClassVar[str] = "Zephyrex RPG AI chat messages"

    class Create(BaseModel, MessageChecks):
        chat_id: str = Field(..., min_length=1)
        parent_id: str | None = None
        role: str = Field(...)
        channel: str = "ic"
        speaker_character_id: str | None = None
        swipes: list[str] = Field(...)
        swipe_index: int = Field(0, ge=0)
        bookmarked: bool = False

        @model_validator(mode="after")
        def _shown_swipe_exists(self) -> "ChatMessageModel.Create":
            if self.swipe_index >= len(self.swipes):
                raise ValueError("swipe_index must name one of the swipes")
            return self

    # A message stays in its chat and keeps its place in the tree; what it says, and which
    # alternative shows, can change.
    class Update(BaseModel, MessageChecks):
        channel: str | None = None
        swipes: list[str] | None = None
        swipe_index: int | None = Field(None, ge=0)
        bookmarked: bool | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None


class ChatMessageManager(AbstractBLLManager[ChatMessageModel], RouterMixin):
    _model = ChatMessageModel

    def _invalid(self, field: str, message: str) -> HTTPException:
        return HTTPException(
            status_code=422,
            detail={"message": "Validation error", "code": "validation_error", "errors": [{"loc": [field], "msg": message}]},
        )

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("channel", "ic")
        kwargs.setdefault("swipe_index", 0)
        kwargs.setdefault("bookmarked", False)
        chats = ChatManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        try:
            chat = chats.get(id=kwargs["chat_id"])
        except HTTPException as error:
            raise not_yours("chat_id") from error
        parent = kwargs.get("parent_id")
        if parent is not None and not any(message.id == parent for message in super().list(chat_id=chat.id)):
            raise self._invalid("parent_id", "The parent must be a message in the same chat")
        speaker = kwargs.get("speaker_character_id")
        if speaker is not None and speaker not in (chat.character_ids or []):
            raise self._invalid("speaker_character_id", "The speaker must be a character in the chat")
        created = super().create(**kwargs)
        # A new turn brings its chat to the top of the list.
        chats.update(chat.id, title=chat.title)
        return created

    def update(self, id: str, **kwargs: Any) -> Any:
        current = self.get(id=id)
        swipes = kwargs.get("swipes") if kwargs.get("swipes") is not None else current.swipes
        index = kwargs.get("swipe_index") if kwargs.get("swipe_index") is not None else current.swipe_index
        if index >= len(swipes):
            raise self._invalid("swipe_index", "swipe_index must name one of the swipes")
        return super().update(id, **kwargs)

    def delete_one(self, id: str) -> None:
        super().delete(id)

    def delete(self, id: str) -> None:
        # A message's replies have nothing to answer once it is gone: its whole branch goes with it.
        message = self.get(id=id)
        in_chat = super().list(chat_id=message.chat_id)
        doomed = {id}
        grew = True
        while grew:
            before = len(doomed)
            doomed |= {other.id for other in in_chat if other.parent_id in doomed}
            grew = len(doomed) > before
        for doomed_id in doomed:
            super().delete(doomed_id)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        # Oldest first: a chat reads in the order it was written (as the lite edition answers).
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: str(getattr(row, "created_at", ""))) if isinstance(rows, list) else rows


# ---- generation_preset -----------------------------------------------------------------


class PresetChecks(PlainModel):
    @field_validator("temperature", "top_p", "top_k", "repetition_penalty", "max_tokens", "context_tokens", check_fields=False)
    @classmethod
    def _within_range(cls, value: Any, info: Any) -> Any:
        return _ranged(info.field_name, value)

    @field_validator("stop", check_fields=False)
    @classmethod
    def _checked_stops(cls, value: Any) -> Any:
        return _stops(value)

    @field_validator("prompt_layout", check_fields=False)
    @classmethod
    def _checked_layout(cls, value: Any) -> Any:
        return _prompt_layout(value)


class GenerationPresetModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["GenerationPresetManager"]]
    name: str = Field(..., description="Name")
    temperature: float = Field(PRESET_DEFAULTS["temperature"])
    top_p: float = Field(PRESET_DEFAULTS["top_p"])
    top_k: int = Field(int(PRESET_DEFAULTS["top_k"]))
    repetition_penalty: float = Field(PRESET_DEFAULTS["repetition_penalty"])
    max_tokens: int = Field(int(PRESET_DEFAULTS["max_tokens"]))
    context_tokens: int = Field(int(PRESET_DEFAULTS["context_tokens"]))
    stop: list[str] = Field(default_factory=list)
    prompt_layout: list[dict[str, Any]] = Field(default_factory=list, description="The prompt manager's sections, in order")

    table_comment: ClassVar[str] = "Zephyrex RPG AI sampler presets"

    class Create(BaseModel, PresetChecks):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        temperature: float = PRESET_DEFAULTS["temperature"]
        top_p: float = PRESET_DEFAULTS["top_p"]
        top_k: int = int(PRESET_DEFAULTS["top_k"])
        repetition_penalty: float = PRESET_DEFAULTS["repetition_penalty"]
        max_tokens: int = int(PRESET_DEFAULTS["max_tokens"])
        context_tokens: int = int(PRESET_DEFAULTS["context_tokens"])
        stop: list[str] = Field(default_factory=list)
        prompt_layout: list[dict[str, Any]] = Field(default_factory=list)

    class Update(BaseModel, PresetChecks):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        temperature: float | None = None
        top_p: float | None = None
        top_k: int | None = None
        repetition_penalty: float | None = None
        max_tokens: int | None = None
        context_tokens: int | None = None
        stop: list[str] | None = None
        prompt_layout: list[dict[str, Any]] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class GenerationPresetManager(AbstractBLLManager[GenerationPresetModel], RouterMixin):
    _model = GenerationPresetModel

    def create(self, **kwargs: Any) -> Any:
        # Scalar defaults are written; the list's must be explicit.
        kwargs.setdefault("stop", [])
        kwargs.setdefault("prompt_layout", [])
        for setting, value in PRESET_DEFAULTS.items():
            kwargs.setdefault(setting, value)
        return super().create(**kwargs)


# ---- model_endpoint --------------------------------------------------------------------


class EndpointChecks(PlainModel):
    @field_validator("base_url", check_fields=False)
    @classmethod
    def _checked_url(cls, value: Any) -> Any:
        return _base_url(value)


class ModelEndpointModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ModelEndpointManager"]]
    name: str = Field(..., description="Name")
    base_url: str = Field(..., description="The endpoint's OpenAI-compatible address")
    model: str = Field(..., description="The model to ask")
    is_default: bool = Field(False, description="Used by chats that name no model")
    has_api_key: bool = Field(False, description="Set by the server: whether a key is stored")
    # Write-only: excluded from every serialization, kept encrypted.
    api_key: str | None = Field(None, exclude=True, description="Set by the server: the encrypted API key")

    table_comment: ClassVar[str] = "Zephyrex RPG AI model endpoints"

    class Create(BaseModel, EndpointChecks):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        base_url: str = Field(..., min_length=1, max_length=MAX_URL)
        model: str = Field(..., min_length=1, max_length=MAX_MODEL)
        api_key: str = Field("", max_length=MAX_KEY)
        is_default: bool = False

    class Update(BaseModel, EndpointChecks):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        base_url: str | None = Field(None, min_length=1, max_length=MAX_URL)
        model: str | None = Field(None, min_length=1, max_length=MAX_MODEL)
        api_key: str | None = Field(None, max_length=MAX_KEY)
        is_default: bool | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


def _keyed(fields: dict[str, Any]) -> dict[str, Any]:
    """The write with its API key encrypted (an empty key clears it)."""
    if "api_key" not in fields or fields["api_key"] is None:
        fields.pop("api_key", None)
        return fields
    key = fields.pop("api_key")
    return {**fields, "api_key": encrypt_secret(key) if key else None, "has_api_key": bool(key)}


class ModelEndpointManager(AbstractBLLManager[ModelEndpointModel], RouterMixin):
    _model = ModelEndpointModel

    def _clear_other_defaults(self, keep_id: str | None) -> None:
        for other in super().list(is_default=True):
            if other.id != keep_id:
                super().update(other.id, is_default=False)

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("is_default", False)
        kwargs.setdefault("has_api_key", False)
        if kwargs["is_default"]:
            self._clear_other_defaults(None)
        return super().create(**_keyed(kwargs))

    def update(self, id: str, **kwargs: Any) -> Any:
        updated = super().update(id, **_keyed(kwargs))
        if kwargs.get("is_default"):
            self._clear_other_defaults(id)
        return updated


# ---- generation ------------------------------------------------------------------------


class GenerateRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    speaker_id: str | None = None
    mode: str = "reply"

    @field_validator("mode")
    @classmethod
    def _checked_mode(cls, value: Any) -> Any:
        return _one_of(value, PROMPT["modes"], "mode")


class PromptMessage(PlainModel):
    role: str
    content: str
    tokens: int


class InspectedPrompt(PlainModel):
    messages: list[PromptMessage]
    dropped: int
    tokens: int
    context_tokens: int
    max_tokens: int
    active_lore: list[str]


class InspectEnvelope(PlainModel):
    prompt: InspectedPrompt


class GenerateEnvelope(PlainModel):
    generate: GenerateRequest


def completions_url(base_url: str) -> str:
    """The endpoint's chat-completions URL: its base, with ``/chat/completions`` once."""
    base = base_url.rstrip("/")
    return base if base.endswith("/chat/completions") else f"{base}/chat/completions"


def delta_of(payload: str) -> str | None:
    """The text a streamed completion's ``data:`` payload adds, or None."""
    body = payload.strip()
    if not body or body == "[DONE]":
        return None
    try:
        parsed = json.loads(body)
        content = parsed["choices"][0]["delta"].get("content")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        return None
    return content if isinstance(content, str) and content else None


def frame(name: str, data: dict[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def branch_to(messages: Sequence[Any], leaf_id: str) -> list[Any]:
    """The messages from the root to ``leaf_id``, oldest first (client/src/features/chat/branch.ts)."""
    by_id = {message.id: message for message in messages}
    path: list[Any] = []
    seen: set[str] = set()
    current = by_id.get(leaf_id)
    while current is not None and current.id not in seen:
        seen.add(current.id)
        path.append(current)
        current = by_id.get(current.parent_id) if current.parent_id is not None else None
    return list(reversed(path))


class AIChatManager(AbstractBLLManager[Any], RouterMixin):
    prefix: ClassVar[str | None] = "/v1/ai_chat"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    routes_to_register: ClassVar[list[RouteType] | None] = []

    def _manager(self, manager: type[Any]) -> Any:
        return manager(requester_id=str(self.requester.id), model_registry=self.model_registry)

    def _inputs(self, body: GenerateRequest, save_timers: bool = True) -> tuple[Any, dict[str, Any], dict[str, Any], list[str]]:
        """Everything a reply needs, read as the requester sees it (lib/generate.ts, step for step)."""
        try:
            chat = self._manager(ChatManager).get(id=body.chat_id)
        except HTTPException as error:
            raise HTTPException(status_code=404, detail={"message": "Request searched ChatModel and could not find the required record."}) from error

        characters = self._manager(CharacterManager)
        cast = []
        own_books: list[str] = []
        for character_id in chat.character_ids or []:
            row = characters.get(id=character_id)
            if getattr(row, "lorebook_id", None):
                own_books.append(row.lorebook_id)
            cast.append({key: getattr(row, key) for key in ("id", "name", "description", "personality", "scenario", "example_messages", "system_prompt", "post_history_instructions")})
        speaker_id = body.speaker_id or (cast[0]["id"] if cast else None)
        if speaker_id is None or all(character["id"] != speaker_id for character in cast):
            raise HTTPException(status_code=422, detail={"message": "The speaker must be a character in the chat", "code": "validation_error"})

        personas = self._manager(PersonaManager)
        persona_row = personas.get(id=chat.persona_id) if chat.persona_id else next(iter(personas.list(is_default=True)), None)
        persona = None if persona_row is None else {"name": persona_row.name, "description": persona_row.description}

        messages = self._manager(ChatMessageManager).list(chat_id=chat.id)
        if body.leaf_id is not None and all(message.id != body.leaf_id for message in messages):
            raise HTTPException(status_code=422, detail={"message": "The leaf must be a message in the chat", "code": "validation_error"})
        history = [
            {
                "role": message.role,
                "channel": message.channel,
                "speaker_character_id": message.speaker_character_id,
                "content": message.swipes[message.swipe_index] if message.swipe_index < len(message.swipes) else "",
            }
            for message in (branch_to(messages, body.leaf_id) if body.leaf_id is not None else [])
        ]

        # World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
        story_texts = [turn["content"] for turn in history if turn["channel"] in PROMPT["story_channels"]]
        book_ids = list(dict.fromkeys([*(chat.lorebook_ids or []), *own_books]))
        entries_manager = self._manager(LorebookEntryManager)
        entries = [
            {key: getattr(row, key) for key in LORE_ENTRY_FIELDS}
            for book_id in book_ids
            for row in entries_manager.list(lorebook_id=book_id)
        ]
        timers = self._manager(ChatLoreStateManager)
        settings = {
            "scan_depth": LORE["defaults"]["scan_depth"],
            "token_budget": LORE["defaults"]["token_budget"],
            "recursion_steps": LORE["defaults"]["recursion_steps"],
            "case_sensitive": False,
            "match_whole_words": False,
            **(chat.lore_settings or {}),
        }
        speaker_name = next(character["name"] for character in cast if character["id"] == speaker_id)
        lore = activate_lore(entries, story_texts, len(story_texts), speaker_name, timers.read(chat.id), settings, random.random)
        if save_timers:
            timers.save(chat.id, lore.state)

        sampler: dict[str, Any] = {**PRESET_DEFAULTS, "stop": [], "prompt_layout": []}
        if chat.preset_id:
            preset = self._manager(GenerationPresetManager).get(id=chat.preset_id)
            sampler = {key: getattr(preset, key) for key in (*PRESET_DEFAULTS.keys(), "stop", "prompt_layout")}

        endpoints = self._manager(ModelEndpointManager)
        if chat.endpoint_id:
            endpoint = endpoints.get(id=chat.endpoint_id)
        else:
            endpoint = next(iter(endpoints.list(is_default=True)), None) or next(iter(endpoints.list()), None)
        if endpoint is None:
            raise HTTPException(status_code=409, detail={"message": "Add a model endpoint first", "code": "no_model_endpoint"})

        assembled = assemble_prompt(
            cast,
            speaker_id,
            persona,
            chat.author_note or "",
            history,
            int(sampler["context_tokens"]),
            int(sampler["max_tokens"]),
            {"sections": lore.sections, "at_depth": lore.at_depth},
            body.mode,
            sampler["prompt_layout"] or [],
            chat.system_prompt or "",
        )
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        request = {
            "url": completions_url(endpoint.base_url),
            "headers": {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
            "json": {
                "model": endpoint.model,
                "messages": assembled.messages,
                "stream": True,
                "temperature": sampler["temperature"],
                "top_p": sampler["top_p"],
                "top_k": sampler["top_k"],
                "repetition_penalty": sampler["repetition_penalty"],
                "max_tokens": sampler["max_tokens"],
                **({"stop": sampler["stop"]} if sampler["stop"] else {}),
            },
        }
        return assembled, request, sampler, lore.active

    @custom_route(
        method="POST",
        path="/prompt",
        input_model=GenerateEnvelope,
        output_model=InspectEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="What the model would be given for this request, without asking it (the context inspector)",
    )
    async def prompt_route(self, body: GenerateEnvelope) -> InspectEnvelope:
        # A preview: the lore timers do not move and no model is asked.
        assembled, _request, sampler, active = self._inputs(body.generate, save_timers=False)
        messages = [PromptMessage(**message, tokens=estimate_tokens(message)) for message in assembled.messages]
        return InspectEnvelope(
            prompt=InspectedPrompt(
                messages=messages,
                dropped=assembled.dropped,
                tokens=sum(message.tokens for message in messages),
                context_tokens=int(sampler["context_tokens"]),
                max_tokens=int(sampler["max_tokens"]),
                active_lore=active,
            )
        )

    @custom_route(
        method="POST",
        path="/generate",
        input_model=GenerateEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        response_class=StreamingResponse,
        openapi_tags=("AI Chat",),
        summary="A character's next reply, streamed",
    )
    async def generate_route(self, body: GenerateEnvelope) -> StreamingResponse:
        assembled, request, _sampler, _active = self._inputs(body.generate)
        client = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS)
        try:
            upstream = await client.send(client.build_request("POST", **request), stream=True)
        except httpx.HTTPError as error:
            await client.aclose()
            raise HTTPException(status_code=502, detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"}) from error
        if upstream.status_code >= 400:
            await upstream.aclose()
            await client.aclose()
            raise HTTPException(status_code=502, detail={"message": f"The model endpoint answered {upstream.status_code}", "code": "model_refused"})

        async def events() -> AsyncIterator[str]:
            try:
                async for line in upstream.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :]
                    if payload.strip() == "[DONE]":
                        break
                    delta = delta_of(payload)
                    if delta is not None:
                        yield frame("delta", {"text": delta})
                yield frame("done", {"dropped": assembled.dropped})
            except httpx.HTTPError:
                yield frame("error", {"detail": "The model stopped mid-reply"})
            finally:
                await upstream.aclose()
                await client.aclose()

        return event_stream(events())
