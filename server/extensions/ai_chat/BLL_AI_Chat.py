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
import re
from collections.abc import AsyncIterator, Mapping, Sequence
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
    _avatar,
    _tags,
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
from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
    CampaignManager,
    ScenarioManager,
    frame_of,
    scenario_of,
)
from zephyrex.extensions.ai_chat.DataBank import data_bank_text  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Instruct import instruct_stops, render_instruct  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Regex import compile_find  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Prompt import (  # type: ignore[import-not-found]
    assemble_prompt,
    estimate_tokens,
    summary_prompt,
    table_gm_prompt,
    translate_prompt,
)
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
# The stored key is encrypted, so the schema the framework re-validates it with allows the longer
# token; the person's own key is held to MAX_KEY by the manager before it is encrypted.
MAX_STORED_KEY: int = MAX_KEY * 2 + 256
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

    @field_validator("tags", check_fields=False)
    @classmethod
    def _checked_tags(cls, value: Any) -> Any:
        # The same tag rules as a character's.
        return _tags(value)

    @field_validator("table_notes", check_fields=False)
    @classmethod
    def _checked_table_notes(cls, value: Any) -> Any:
        if value is None:
            return None
        if len(value) > LIMITS["table_notes"]:
            raise ValueError(f"At most {LIMITS['table_notes']} table notes")
        cleaned = []
        for note in value:
            text = note.get("text") if isinstance(note, dict) else None
            if set(note) != {"kind", "text"} or note["kind"] not in CONTRACT["table"]["note_kinds"] or not isinstance(text, str):
                raise ValueError(f"A table note is {{kind, text}}, kind one of {', '.join(CONTRACT['table']['note_kinds'])}")
            if not text.strip() or len(text.strip()) > LIMITS["short_text_characters"]:
                raise ValueError(f"A table note is 1 to {LIMITS['short_text_characters']} characters")
            cleaned.append({"kind": note["kind"], "text": text.strip()})
        return cleaned

    @field_validator("content_rating", check_fields=False)
    @classmethod
    def _checked_rating(cls, value: Any) -> Any:
        return _one_of(value, CONTRACT["safety"]["ratings"], "content_rating")

    @field_validator("lines", "veils", check_fields=False)
    @classmethod
    def _checked_safety_items(cls, value: Any) -> Any:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if isinstance(item, str)]
        if len(cleaned) != len(value) or len(cleaned) > LIMITS["safety_items"] or any(not item or len(item) > LIMITS["short_text_characters"] for item in cleaned):
            raise ValueError(f"At most {LIMITS['safety_items']} items of 1 to {LIMITS['short_text_characters']} characters")
        return cleaned

    @field_validator("objectives", check_fields=False)
    @classmethod
    def _checked_objectives(cls, value: Any) -> Any:
        if value is None:
            return None
        if len(value) > LIMITS["objectives_per_chat"]:
            raise ValueError(f"At most {LIMITS['objectives_per_chat']} objectives")
        cleaned = []
        for objective in value:
            text = objective.get("text") if isinstance(objective, dict) else None
            if set(objective) != {"text", "done"} or not isinstance(text, str) or not isinstance(objective["done"], bool):
                raise ValueError("An objective is {text, done}")
            if not text.strip() or len(text.strip()) > LIMITS["short_text_characters"]:
                raise ValueError(f"An objective is 1 to {LIMITS['short_text_characters']} characters")
            cleaned.append({"text": text.strip(), "done": objective["done"]})
        return cleaned

    @field_validator("background", check_fields=False)
    @classmethod
    def _checked_background(cls, value: Any) -> Any:
        # The same rules as an avatar's.
        return _avatar(value)

    @field_validator("folder", check_fields=False)
    @classmethod
    def _checked_folder(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

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
    summary: str = Field("", description="The story so far, as the model reads it (A19)")
    tags: list[str] = Field(default_factory=list, description="Tags, for finding it in the library")
    folder: str = Field("", description="The library folder it sits in (blank: none)")
    muted_ids: list[str] = Field(default_factory=list, description="Group members left out of the turn order")
    background: str | None = Field(None, description="A picture behind the chat (a data URL)")
    objectives: list[dict[str, Any]] = Field(default_factory=list, description="Its tasks in order; the first not done is put to the model")
    content_rating: str | None = Field(None, description="general, teen or mature (null: none set)")
    lines: list[str] = Field(default_factory=list, description="Never in the story, even off-screen")
    veils: list[str] = Field(default_factory=list, description="Only ever off-screen")
    table_notes: list[dict[str, Any]] = Field(default_factory=list, description="House rules, pacing, tone and reminders, read every turn")
    campaign_id: str | None = Field(None, description="The campaign it belongs to; its frame is read every turn")
    scenario_id: str | None = Field(None, description="The scenario it runs; the GM's view of it is read every turn")
    paused: bool = Field(False, description="No story turns until the table resumes")

    table_comment: ClassVar[str] = "Zephyrex RPG AI chats"

    class Create(ChatChecks, BaseModel):
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
        summary: str = Field("", max_length=LIMITS["chat_summary_characters"])
        tags: list[str] = Field(default_factory=list)
        folder: str = Field("", max_length=MAX_NAME)
        muted_ids: list[str] = Field(default_factory=list)
        background: str | None = None
        objectives: list[dict[str, Any]] = Field(default_factory=list)
        content_rating: str | None = None
        lines: list[str] = Field(default_factory=list)
        veils: list[str] = Field(default_factory=list)
        table_notes: list[dict[str, Any]] = Field(default_factory=list)
        paused: bool = False
        campaign_id: str | None = None
        scenario_id: str | None = None

    class Update(ChatChecks, BaseModel):
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
        summary: str | None = Field(None, max_length=LIMITS["chat_summary_characters"])
        tags: list[str] | None = None
        folder: str | None = Field(None, max_length=MAX_NAME)
        muted_ids: list[str] | None = None
        background: str | None = None
        objectives: list[dict[str, Any]] | None = None
        content_rating: str | None = None
        lines: list[str] | None = None
        veils: list[str] | None = None
        table_notes: list[dict[str, Any]] | None = None
        paused: bool | None = None
        campaign_id: str | None = None
        scenario_id: str | None = None

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
        for character_id in fields.get("muted_ids") or []:
            self._owned(CharacterManager, character_id, "muted_ids")
        for book_id in fields.get("lorebook_ids") or []:
            self._owned(LorebookManager, book_id, "lorebook_ids")
        for field, manager in (
            ("persona_id", PersonaManager),
            ("preset_id", GenerationPresetManager),
            ("endpoint_id", ModelEndpointManager),
            ("campaign_id", CampaignManager),
            ("scenario_id", ScenarioManager),
        ):
            if fields.get(field) is not None:
                self._owned(manager, fields[field], field)

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("mode", "character")
        kwargs.setdefault("author_note", "")
        kwargs.setdefault("lorebook_ids", [])
        kwargs.setdefault("lore_settings", {})
        kwargs.setdefault("system_prompt", "")
        kwargs.setdefault("summary", "")
        kwargs.setdefault("tags", [])
        kwargs.setdefault("folder", "")
        kwargs.setdefault("muted_ids", [])
        kwargs.setdefault("objectives", [])
        kwargs.setdefault("lines", [])
        kwargs.setdefault("veils", [])
        kwargs.setdefault("table_notes", [])
        kwargs.setdefault("paused", False)
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
    images: list[str] = Field(default_factory=list, description="Pictures sent with it (data URLs)")
    x_carded: bool = Field(False, description="X-carded by the table: kept, never read by the model")

    table_comment: ClassVar[str] = "Zephyrex RPG AI chat messages"

    class Create(MessageChecks, BaseModel):
        chat_id: str = Field(..., min_length=1)
        parent_id: str | None = None
        role: str = Field(...)
        channel: str = "ic"
        speaker_character_id: str | None = None
        swipes: list[str] = Field(...)
        swipe_index: int = Field(0, ge=0)
        bookmarked: bool = False
        images: list[str] = Field(default_factory=list)

        @field_validator("images")
        @classmethod
        def _checked_images(cls, value: list[str]) -> list[str]:
            if len(value) > LIMITS["images_per_message"]:
                raise ValueError(f"At most {LIMITS['images_per_message']} pictures")
            for image in value:
                _avatar(image)
            return value

        @model_validator(mode="after")
        def _shown_swipe_exists(self) -> "ChatMessageModel.Create":
            if self.swipe_index >= len(self.swipes):
                raise ValueError("swipe_index must name one of the swipes")
            return self

    # A message stays in its chat and keeps its place in the tree; what it says, and which
    # alternative shows, can change.
    class Update(MessageChecks, BaseModel):
        channel: str | None = None
        swipes: list[str] | None = None
        swipe_index: int | None = Field(None, ge=0)
        bookmarked: bool | None = None
        x_carded: bool | None = None

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

    class Create(PresetChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        temperature: float = PRESET_DEFAULTS["temperature"]
        top_p: float = PRESET_DEFAULTS["top_p"]
        top_k: int = int(PRESET_DEFAULTS["top_k"])
        repetition_penalty: float = PRESET_DEFAULTS["repetition_penalty"]
        max_tokens: int = int(PRESET_DEFAULTS["max_tokens"])
        context_tokens: int = int(PRESET_DEFAULTS["context_tokens"])
        stop: list[str] = Field(default_factory=list)
        prompt_layout: list[dict[str, Any]] = Field(default_factory=list)

    class Update(PresetChecks, BaseModel):
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

    @field_validator("api", check_fields=False)
    @classmethod
    def _checked_api(cls, value: Any) -> Any:
        return _one_of(value, CONTRACT["endpoint_apis"], "api")

    @field_validator("roles", check_fields=False)
    @classmethod
    def _checked_roles(cls, value: Any) -> Any:
        if value is not None and (len(set(value)) != len(value) or any(role not in CONTRACT["endpoint_roles"] for role in value)):
            raise ValueError(f"roles are {', '.join(CONTRACT['endpoint_roles'])}, each once")
        return value

    @field_validator("instruct_template", check_fields=False)
    @classmethod
    def _checked_template(cls, value: Any) -> Any:
        return _one_of(value, list(CONTRACT["instruct_templates"]), "instruct_template")


class ModelEndpointModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ModelEndpointManager"]]
    name: str = Field(..., description="Name")
    base_url: str = Field(..., description="The endpoint's OpenAI-compatible address")
    model: str = Field(..., description="The model to ask")
    is_default: bool = Field(False, description="Used by chats that name no model")
    api: str = Field("chat", description="chat (chat completions) or text (one prompt in the instruct template)")
    roles: list[str] = Field(default_factory=list, description="What it is used for: story, gm, summary, translate")
    instruct_template: str = Field("chatml", description="A text API's prompt markup")
    has_api_key: bool = Field(False, description="Set by the server: whether a key is stored")
    # Write-only: excluded from every serialization, kept encrypted.
    api_key: str | None = Field(None, exclude=True, description="Set by the server: the encrypted API key")

    table_comment: ClassVar[str] = "Zephyrex RPG AI model endpoints"

    class Create(EndpointChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        base_url: str = Field(..., min_length=1, max_length=MAX_URL)
        model: str = Field(..., min_length=1, max_length=MAX_MODEL)
        api_key: str = Field("", max_length=MAX_STORED_KEY)
        # Set by the manager from the key, never by a client (it drops one sent).
        has_api_key: bool = False
        is_default: bool = False
        api: str = "chat"
        instruct_template: str = "chatml"
        roles: list[str] = Field(default_factory=list)

    class Update(EndpointChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        base_url: str | None = Field(None, min_length=1, max_length=MAX_URL)
        model: str | None = Field(None, min_length=1, max_length=MAX_MODEL)
        api_key: str | None = Field(None, max_length=MAX_STORED_KEY)
        has_api_key: bool | None = None
        is_default: bool | None = None
        api: str | None = None
        instruct_template: str | None = None
        roles: list[str] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


def _keyed(fields: dict[str, Any]) -> dict[str, Any]:
    """The write with its API key encrypted (an empty key clears it) and ``has_api_key`` set from
    it; a ``has_api_key`` the client sent is dropped."""
    fields.pop("has_api_key", None)
    raw = fields.get("api_key")
    if isinstance(raw, str) and len(raw) > MAX_KEY:
        raise HTTPException(status_code=422, detail={"message": f"An API key is at most {MAX_KEY} characters", "code": "validation_error"})
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
        if kwargs["is_default"]:
            self._clear_other_defaults(None)
        return super().create(**{"has_api_key": False, **_keyed(kwargs)})

    def update(self, id: str, **kwargs: Any) -> Any:
        updated = super().update(id, **_keyed(kwargs))
        if kwargs.get("is_default"):
            self._clear_other_defaults(id)
        return updated


# ---- regex_script ----------------------------------------------------------------------

REGEX = CONTRACT["regex"]


def _regex_find(value: Any) -> Any:
    if value is not None and compile_find(value) is None:
        raise ValueError("The pattern does not compile (flags: g, i, m, s)")
    return value


def _regex_placements(value: Any) -> Any:
    if value is not None and (not value or len(set(value)) != len(value) or any(one not in REGEX["placements"] for one in value)):
        raise ValueError(f"placements are one or more of {', '.join(REGEX['placements'])}, each once")
    return value


def _regex_depth(value: Any) -> Any:
    low, high = REGEX["depth_range"]
    if value is not None and not low <= value <= high:
        raise ValueError(f"A depth is {low} to {high}")
    return value


class RegexChecks(PlainModel):
    @field_validator("find", check_fields=False)
    @classmethod
    def _checked_find(cls, value: Any) -> Any:
        return _regex_find(value)

    @field_validator("placements", check_fields=False)
    @classmethod
    def _checked_placements(cls, value: Any) -> Any:
        return _regex_placements(value)

    @field_validator("min_depth", "max_depth", check_fields=False)
    @classmethod
    def _checked_depth(cls, value: Any) -> Any:
        return _regex_depth(value)


class RegexScriptModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["RegexScriptManager"]]
    name: str = Field(..., description="Name")
    find: str = Field(..., description="/pattern/flags (g, i, m, s) or a bare pattern")
    replace: str = Field("", description="The replacement: $1, $&, {{match}}, $$")
    placements: list[str] = Field(default_factory=lambda: ["ai_output"], description="user_input and/or ai_output")
    display_only: bool = Field(False, description="Only as the message is shown")
    prompt_only: bool = Field(False, description="Only as the model reads it")
    min_depth: int | None = Field(None, description="Newest message is 0")
    max_depth: int | None = Field(None, description="Newest message is 0")
    enabled: bool = Field(True, description="Whether it runs")
    position: int = Field(0, description="Scripts run in this order")

    table_comment: ClassVar[str] = "Zephyrex RPG AI regex scripts"

    class Create(RegexChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        find: str = Field(..., min_length=1, max_length=LIMITS["regex_pattern_characters"])
        replace: str = Field("", max_length=LIMITS["regex_replacement_characters"])
        placements: list[str] = Field(default_factory=lambda: ["ai_output"])
        display_only: bool = False
        prompt_only: bool = False
        min_depth: int | None = None
        max_depth: int | None = None
        enabled: bool = True
        position: int = Field(0, ge=0, le=LIMITS["regex_scripts"])

        @model_validator(mode="after")
        def _one_target(self) -> "RegexScriptModel.Create":
            if self.display_only and self.prompt_only:
                raise ValueError("A script is display-only or prompt-only, not both")
            return self

    class Update(RegexChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        find: str | None = Field(None, min_length=1, max_length=LIMITS["regex_pattern_characters"])
        replace: str | None = Field(None, max_length=LIMITS["regex_replacement_characters"])
        placements: list[str] | None = None
        display_only: bool | None = None
        prompt_only: bool | None = None
        min_depth: int | None = None
        max_depth: int | None = None
        enabled: bool | None = None
        position: int | None = Field(None, ge=0, le=LIMITS["regex_scripts"])

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class RegexScriptManager(AbstractBLLManager[RegexScriptModel], RouterMixin):
    _model = RegexScriptModel

    def create(self, **kwargs: Any) -> Any:
        for key, value in (("replace", ""), ("placements", ["ai_output"]), ("display_only", False), ("prompt_only", False), ("enabled", True), ("position", 0)):
            kwargs.setdefault(key, value)
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        # In the order they run (as the lite edition answers).
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: (row.position, row.name)) if isinstance(rows, list) else rows


# ---- quick_reply -----------------------------------------------------------------------

QUICK = CONTRACT["quick_reply"]


class QuickReplyChecks(PlainModel):
    @field_validator("action", check_fields=False)
    @classmethod
    def _checked_action(cls, value: Any) -> Any:
        return _one_of(value, QUICK["actions"], "action")

    @field_validator("channel", check_fields=False)
    @classmethod
    def _checked_channel(cls, value: Any) -> Any:
        return _one_of(value, QUICK["channels"], "channel")


class QuickReplyModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["QuickReplyManager"]]
    label: str = Field(..., description="The button's label")
    message: str = Field(..., description="The line it sends or fills in ({{char}} and {{user}} filled)")
    action: str = Field("send", description="send, or fill in the composer")
    channel: str = Field("ic", description="ic (the story) or ooc (table talk)")
    enabled: bool = Field(True, description="Whether it shows")
    position: int = Field(0, description="Buttons show in this order")

    table_comment: ClassVar[str] = "Zephyrex RPG AI quick replies"

    class Create(QuickReplyChecks, BaseModel):
        label: str = Field(..., min_length=1, max_length=LIMITS["quick_reply_label_characters"])
        message: str = Field(..., min_length=1, max_length=LIMITS["message_characters"])
        action: str = "send"
        channel: str = "ic"
        enabled: bool = True
        position: int = Field(0, ge=0, le=LIMITS["quick_replies"])

    class Update(QuickReplyChecks, BaseModel):
        label: str | None = Field(None, min_length=1, max_length=LIMITS["quick_reply_label_characters"])
        message: str | None = Field(None, min_length=1, max_length=LIMITS["message_characters"])
        action: str | None = None
        channel: str | None = None
        enabled: bool | None = None
        position: int | None = Field(None, ge=0, le=LIMITS["quick_replies"])

    class Search(ApplicationModel.Search):
        label: StringSearchModel | None = None


class QuickReplyManager(AbstractBLLManager[QuickReplyModel], RouterMixin):
    _model = QuickReplyModel

    def create(self, **kwargs: Any) -> Any:
        for key, value in (("action", "send"), ("channel", "ic"), ("enabled", True), ("position", 0)):
            kwargs.setdefault(key, value)
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: (row.position, row.label)) if isinstance(rows, list) else rows


# ---- data_document ---------------------------------------------------------------------

BANK = CONTRACT["data_bank"]


class DataDocumentChecks(PlainModel):
    @field_validator("scope", check_fields=False)
    @classmethod
    def _checked_scope(cls, value: Any) -> Any:
        return _one_of(value, BANK["scopes"], "scope")


class DataDocumentModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["DataDocumentManager"]]
    name: str = Field(..., description="Name")
    text: str = Field(..., description="The document's text")
    scope: str = Field("global", description="global, chat or character")
    scope_id: str | None = Field(None, description="The chat or character it is for (null when global)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI data bank documents"

    class Create(DataDocumentChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        text: str = Field(..., min_length=1, max_length=LIMITS["data_document_characters"])
        scope: str = "global"
        scope_id: str | None = None

        @model_validator(mode="after")
        def _scope_named(self) -> "DataDocumentModel.Create":
            if (self.scope == "global") != (self.scope_id is None):
                raise ValueError("A global document names no chat or character; a chat or character document names one")
            return self

    # A document keeps its scope; its name and text can change.
    class Update(DataDocumentChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        text: str | None = Field(None, min_length=1, max_length=LIMITS["data_document_characters"])

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None
        scope: StringSearchModel | None = None
        scope_id: StringSearchModel | None = None


class DataDocumentManager(AbstractBLLManager[DataDocumentModel], RouterMixin):
    _model = DataDocumentModel

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("scope", "global")
        kwargs.setdefault("scope_id", None)
        if kwargs["scope_id"] is not None:
            manager = ChatManager if kwargs["scope"] == "chat" else CharacterManager
            try:
                manager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(id=kwargs["scope_id"])
            except HTTPException as error:
                raise not_yours("scope_id") from error
        return super().create(**kwargs)


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


class Summary(PlainModel):
    text: str
    #: Story turns too old to fit the window, left out of what was summarised.
    dropped: int


class SummaryEnvelope(PlainModel):
    summary: Summary


class TranslateRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=LIMITS["translate_characters"])
    #: A language as people name it ("French", "fr-CA"): the model reads it.
    language: str = Field(..., min_length=1, max_length=LIMITS["language_characters"])


class TranslateEnvelope(PlainModel):
    translate: TranslateRequest


class GenerateEnvelope(PlainModel):
    generate: GenerateRequest


def completions_url(base_url: str, api: str = "chat") -> str:
    """The endpoint's completions URL: its base with ``/chat/completions`` (``/completions`` for a text API) once."""
    base = base_url.rstrip("/")
    path = "/chat/completions" if api == "chat" else "/completions"
    if base.endswith(path):
        return base
    return re.sub(r"/(chat/)?completions$", "", base) + path


def with_images(messages: list[dict[str, str]], images: Sequence[str]) -> list[dict[str, Any]]:
    """The messages with ``images`` added to the last user message as OpenAI-style content parts
    (A44), for a vision model; unchanged when there are none."""
    if not images:
        return list(messages)
    last = max((index for index, message in enumerate(messages) if message["role"] == "user"), default=-1)
    return [
        {
            "role": message["role"],
            "content": [{"type": "text", "text": message["content"]}, *({"type": "image_url", "image_url": {"url": url}} for url in images)],
        }
        if index == last
        else message
        for index, message in enumerate(messages)
    ]


def upstream_body(
    endpoint: Any, sampler: Mapping[str, Any], messages: list[dict[str, str]], mode: str, images: Sequence[str] = ()
) -> dict[str, Any]:
    """The messages for a chat API; for a text API one prompt in the endpoint's instruct template (a
    continued reply left open), with the template's stop strings added."""
    text = endpoint.api == "text"
    stop = [*sampler["stop"], *(instruct_stops(endpoint.instruct_template) if text else [])]
    return {
        "model": endpoint.model,
        **({"prompt": render_instruct(messages, endpoint.instruct_template, mode == "continue")} if text else {"messages": with_images(messages, images)}),
        "stream": True,
        "temperature": sampler["temperature"],
        "top_p": sampler["top_p"],
        "top_k": sampler["top_k"],
        "repetition_penalty": sampler["repetition_penalty"],
        "max_tokens": sampler["max_tokens"],
        **({"stop": stop} if stop else {}),
    }


def delta_of(payload: str) -> str | None:
    """The text a streamed completion's ``data:`` payload adds, or None."""
    body = payload.strip()
    if not body or body == "[DONE]":
        return None
    try:
        parsed = json.loads(body)
        choice = parsed["choices"][0]
        # A chat completion's delta, or a text completion's text.
        content = choice["delta"].get("content") if "delta" in choice else choice.get("text")
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

    def _inputs(
        self, body: GenerateRequest, save_timers: bool = True, purpose: str = "reply"
    ) -> tuple[Any, dict[str, Any], dict[str, Any], list[str], dict[str, Any]]:
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
        # Narrating (A20), the GM speaks, so no character is named as the speaker.
        speaker_id = "" if body.mode == "narrate" else body.speaker_id or (cast[0]["id"] if cast else None)
        if speaker_id is None or (body.mode != "narrate" and all(character["id"] != speaker_id for character in cast)):
            raise HTTPException(status_code=422, detail={"message": "The speaker must be a character in the chat", "code": "validation_error"})

        personas = self._manager(PersonaManager)
        persona_row = personas.get(id=chat.persona_id) if chat.persona_id else next(iter(personas.list(is_default=True)), None)
        persona = None if persona_row is None else {"name": persona_row.name, "description": persona_row.description}

        messages = self._manager(ChatMessageManager).list(chat_id=chat.id)
        if body.leaf_id is not None and all(message.id != body.leaf_id for message in messages):
            raise HTTPException(status_code=422, detail={"message": "The leaf must be a message in the chat", "code": "validation_error"})
        path = branch_to(messages, body.leaf_id) if body.leaf_id is not None else []
        # The newest line's pictures go to a vision model (A44); older ones stay in the chat only.
        leaf = path[-1] if path else None
        images = list(leaf.images or []) if leaf is not None and leaf.role == "user" and leaf.channel == "ic" else []
        history = [
            {
                "role": message.role,
                "channel": message.channel,
                "speaker_character_id": message.speaker_character_id,
                "content": message.swipes[message.swipe_index] if message.swipe_index < len(message.swipes) else "",
                "x_carded": bool(getattr(message, "x_carded", False)),
            }
            for message in path
        ]

        # World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
        # What lore and the data bank scan: the story, less what the table X-carded (A25).
        story_texts = [turn["content"] for turn in history if turn["channel"] in PROMPT["story_channels"] and not turn["x_carded"]]
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
        speaker_name = next((character["name"] for character in cast if character["id"] == speaker_id), "")
        lore = activate_lore(entries, story_texts, len(story_texts), speaker_name, timers.read(chat.id), settings, random.random)
        if save_timers:
            timers.save(chat.id, lore.state)

        sampler: dict[str, Any] = {**PRESET_DEFAULTS, "stop": [], "prompt_layout": []}
        if chat.preset_id:
            preset = self._manager(GenerationPresetManager).get(id=chat.preset_id)
            sampler = {key: getattr(preset, key) for key in (*PRESET_DEFAULTS.keys(), "stop", "prompt_layout")}

        # The model for this request's role (A27): a model serving the role; for replies the chat's
        # own choice comes first. Otherwise the chat's model, then the default, then any.
        role = purpose if purpose != "reply" else "gm" if body.mode in ("table", "narrate") else "story"
        endpoints = self._manager(ModelEndpointManager)
        every = sorted(endpoints.list(), key=lambda row: row.name)
        serving = [row for row in every if role in (row.roles or [])]
        chosen = endpoints.get(id=chat.endpoint_id) if chat.endpoint_id else None
        endpoint = (
            (chosen if role == "story" else None)
            or next((row for row in serving if row.is_default), None)
            or next(iter(serving), None)
            or chosen
            or next((row for row in every if row.is_default), None)
            or next(iter(every), None)
        )
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
            chat.summary or "",
            [
                {key: getattr(script, key) for key in ("find", "replace", "placements", "display_only", "prompt_only", "min_depth", "max_depth", "enabled")}
                for script in self._manager(RegexScriptManager).list()
            ],
            next((objective["text"] for objective in (chat.objectives or []) if not objective["done"]), ""),
            self._data_bank(chat, story_texts),
            {"content_rating": chat.content_rating, "lines": chat.lines or [], "veils": chat.veils or []},
            chat.table_notes or [],
            frame_of(self._manager(CampaignManager).get(id=chat.campaign_id)) if chat.campaign_id else None,
            scenario_of(self._manager(ScenarioManager).get(id=chat.scenario_id)) if chat.scenario_id else None,
        )
        if body.mode == "table":
            # The table GM (A11, A20) reads the table talk, with the story for reference only.
            assembled = table_gm_prompt(
                cast,
                persona,
                history,
                int(sampler["context_tokens"]),
                int(sampler["max_tokens"]),
                chat.summary or "",
                {"content_rating": chat.content_rating, "lines": chat.lines or [], "veils": chat.veils or []},
                chat.table_notes or [],
            )
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        request = {
            "url": completions_url(endpoint.base_url, endpoint.api or "chat"),
            "headers": {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
            "json": upstream_body(endpoint, sampler, assembled.messages, body.mode, images),
        }
        context = {"cast": cast, "persona": persona, "history": history, "endpoint": endpoint, "key": key}
        return assembled, request, sampler, lore.active, context

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
        assembled, _request, sampler, active, _context = self._inputs(body.generate, save_timers=False)
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
        path="/summarize",
        input_model=GenerateEnvelope,
        output_model=SummaryEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A summary of the branch so far, written by the chat's model, for the person to keep or edit (A19)",
    )
    async def summarize_route(self, body: GenerateEnvelope) -> SummaryEnvelope:
        # Nothing is written: the person saves the summary to the chat like any other edit.
        _assembled, _request, sampler, _active, context = self._inputs(body.generate, save_timers=False, purpose="summary")
        asked = summary_prompt(context["cast"], context["persona"], context["history"], int(sampler["context_tokens"]), int(sampler["max_tokens"]))
        text = await self._ask(context, sampler, asked.messages)
        return SummaryEnvelope(summary=Summary(text=text, dropped=asked.dropped))

    @custom_route(
        method="POST",
        path="/translate",
        input_model=TranslateEnvelope,
        output_model=TranslateEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A message translated by the chat's model, for display only (A43)",
    )
    async def translate_route(self, body: TranslateEnvelope) -> TranslateEnvelope:
        asked = body.translate
        _assembled, _request, sampler, _active, context = self._inputs(GenerateRequest(chat_id=asked.chat_id), save_timers=False, purpose="translate")
        text = await self._ask(context, sampler, translate_prompt(asked.text, asked.language))
        return TranslateEnvelope(translate=TranslateRequest(chat_id=asked.chat_id, text=text, language=asked.language))

    def _data_bank(self, chat: Any, story: list[str]) -> str:
        """The data bank's notes for this turn (A41): everyone's documents, the chat's and its cast's."""
        documents = self._manager(DataDocumentManager)

        def named(rows: Any) -> list[Any]:
            # Each group by name, as the lite edition orders them: the order breaks retrieval ties.
            return sorted(rows, key=lambda row: row.name)

        found = [
            *named(documents.list(scope="global")),
            *named(documents.list(scope="chat", scope_id=chat.id)),
            *(document for character_id in chat.character_ids or [] for document in named(documents.list(scope="character", scope_id=character_id))),
        ]
        return data_bank_text([document.text for document in found], story)

    async def _ask(self, context: dict[str, Any], sampler: dict[str, Any], messages: list[dict[str, str]]) -> str:
        """The chat's model's whole answer to ``messages`` (read from its stream), or the framework's 502."""
        endpoint, key = context["endpoint"], context["key"]
        request = {
            "url": completions_url(endpoint.base_url, endpoint.api or "chat"),
            "headers": {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
            "json": upstream_body(endpoint, sampler, messages, "reply"),
        }
        pieces: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS) as client, client.stream("POST", **request) as upstream:
                if upstream.status_code >= 400:
                    raise HTTPException(status_code=502, detail={"message": f"The model endpoint answered {upstream.status_code}", "code": "model_refused"})
                async for line in upstream.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :]
                    if payload.strip() == "[DONE]":
                        break
                    delta = delta_of(payload)
                    if delta is not None:
                        pieces.append(delta)
        except httpx.HTTPError as error:
            raise HTTPException(status_code=502, detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"}) from error
        return "".join(pieces).strip()

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
        # Paused (A25): no story turns until the table resumes; the table GM still answers. Checked
        # first, so a refused turn moves no lore timer.
        if body.generate.mode != "table":
            try:
                paused = bool(self._manager(ChatManager).get(id=body.generate.chat_id).paused)
            except HTTPException:
                paused = False  # an unknown chat is refused by _inputs, as for every route
            if paused:
                raise HTTPException(status_code=409, detail={"message": "The table has paused the game", "code": "paused"})
        assembled, request, _sampler, _active, _context = self._inputs(body.generate)
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
