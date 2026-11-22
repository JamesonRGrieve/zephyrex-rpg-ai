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

import asyncio
import inspect
import json
import random
import re
import time
from collections.abc import AsyncIterator, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any, ClassVar

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PlainModel
from pydantic import Field, field_validator, model_validator
from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
    CampaignFrameManager,
    ScenarioManager,
    frame_for,
    frame_of,
    scenario_of,
)

# Resolve only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_campaign.SceneLocation import scene_location  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.BLL_AI_Character import (  # type: ignore[import-not-found]
    CharacterExpressionManager,
    CharacterManager,
    PersonaManager,
    _avatar,
    _tags,
    not_yours,
)
from zephyrex.extensions.ai_character.Contract import (  # type: ignore[import-not-found]
    CHAT_MODES,
    CONTRACT,
    LIMITS,
    MESSAGE_CHANNELS,
    MESSAGE_ROLES,
    PRESET_DEFAULTS,
    PROMPT,
    SAMPLER_RANGES,
)
from zephyrex.extensions.ai_chat.CampaignFraming import frame_from_framing  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Clarify import (  # type: ignore[import-not-found]
    clarify_need,
    clarify_questions,
    should_ask,
)
from zephyrex.extensions.ai_chat.DataBank import data_bank_text, wiki_document_texts  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Decide import ask_decider  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Dispositions import (  # type: ignore[import-not-found]
    apply_stances,
    parse_status,
    scene_state,
)
from zephyrex.extensions.ai_chat.ExtraBody import extra_body_problem, with_extra_body  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Gen import gen_messages  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Group import group_stops  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.GroupSettings import group_settings_problem  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Injections import injections_problem  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Instruct import (  # type: ignore[import-not-found]
    active_template,
    instruct_stops,
    render_instruct,
)
from zephyrex.extensions.ai_chat.Lore import activate_lore  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.MapStep import map_questions, movers, seat_place  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Memory import story_lines  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.NarratorStyle import (  # type: ignore[import-not-found]
    NARRATOR_STYLE,
    may_narrate,
    narrator_endpoint,
    style_problem,
    style_tuning,
    traits_of,
    traits_problem,
)
from zephyrex.extensions.ai_chat.NativeApis import (  # type: ignore[import-not-found]
    NATIVE_APIS,
    native_model_ids,
    native_models_request,
    native_request,
    openai_payload,
)
from zephyrex.extensions.ai_chat.NpcAuthor import (  # type: ignore[import-not-found]
    NPC_AUTHOR,
    npc_entry,
    npc_figures,
    npc_writing,
)
from zephyrex.extensions.ai_chat.Party import (  # type: ignore[import-not-found]
    one_line,
    party_briefing,
    party_of,
    party_text,
)
from zephyrex.extensions.ai_chat.Play import (  # type: ignore[import-not-found]
    ai_cast,
    session_start_index,
    sessions_summary,
)
from zephyrex.extensions.ai_chat.PlayerLines import parse_player_lines, strip_markup  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Prompt import (  # type: ignore[import-not-found]
    DEFAULT_USER_NAME,
    assemble_prompt,
    background_picture_prompt,
    estimate_tokens,
    expression_prompt,
    frame_text,
    pick_option,
    portrait_picture_prompt,
    scene_picture_prompt,
    split_reasoning,
    summary_prompt,
    table_gm_prompt,
    translate_prompt,
)
from zephyrex.extensions.ai_chat.Regex import compile_find  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Remembering import forget_chat, memories_for  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.RollDecision import (  # type: ignore[import-not-found]
    is_attempt,
    roll_pick,
    roll_questions,
)
from zephyrex.extensions.ai_chat.Samplers import sampler_params, sampler_problem  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Search import (  # type: ignore[import-not-found]
    QUERY_CHARACTERS as SEARCH_QUERY_CHARACTERS,
)
from zephyrex.extensions.ai_chat.Search import search_context, web_search
from zephyrex.extensions.ai_chat.Speech import (  # type: ignore[import-not-found]
    SPEECH,
    audio_data_url,
    audio_type,
    speech_body,
    speech_url,
)
from zephyrex.extensions.ai_chat.StatusLine import status_messages  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Structured import (  # type: ignore[import-not-found]
    STRUCTURED,
    ItemStream,
    fresh_items,
    partial_items,
    run_text,
    structured_runs,
    turn_schema,
)
from zephyrex.extensions.ai_chat.SystemOrder import systems_before_last_user  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.TurnDecision import (  # type: ignore[import-not-found]
    present_cast,
    turn_pick,
    turn_question,
    turn_seat,
    turn_state,
)
from zephyrex.extensions.ai_chat.VoiceGuard import (  # type: ignore[import-not-found]
    VOICE_GUARD,
    paragraph_cut,
    plain_dashes,
)
from zephyrex.extensions.ai_chat.WikiReads import (  # type: ignore[import-not-found]
    advance_clock,
    campaign_documents,
    campaign_framing,
    ensure_person,
    move_person,
    npc_sheet,
    persons_for,
    test_options,
    update_person,
)
from zephyrex.extensions.ai_chat.WorldCast import (  # type: ignore[import-not-found]
    seat_person,
    world_cast,
    world_known_to,
)
from zephyrex.extensions.ai_chat.WorldLore import (  # type: ignore[import-not-found]
    wiki_campaign_of,
    world_lore_entries,
)
from zephyrex.extensions.ai_chat.WorldTick import (  # type: ignore[import-not-found]
    arrivals,
    tick_moves,
    tick_questions,
    tick_state,
)
from zephyrex.extensions.ai_lorebook.BLL_AI_Lorebook import (  # type: ignore[import-not-found]
    ChatLoreStateManager,
    LorebookManager,
)
from zephyrex.extensions.ai_memories.BLL_AI_Memories import MemoryManager
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.lib.EventStream import event_stream
from zephyrex.lib.Logging import logger  # loguru: reaches the journal (stdlib logging isn't wired on prod)
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


_OWN_PROMPT_ID = re.compile(r"^custom:[\w-]{1,60}$", re.ASCII)
_OWN_PROMPT_KEYS = {"id", "name", "content", "role", "position", "depth", "enabled", "max_tokens"}


def _prompt_layout(layout: Any) -> Any:
    """The prompt manager's layout (A16): known sections, the person's own prompts and "start reply
    with" (audit gap 3), each at most once, as lib/rpgRecords.ts checks it."""
    if layout is None:
        return None
    low, high = PROMPT["section_token_range"]
    longest = LIMITS["card_field_characters"]
    seen: set[str] = set()
    own = 0
    for entry in layout:
        entry_id = entry.get("id") if isinstance(entry, dict) else None
        if not isinstance(entry_id, str) or entry_id in seen:
            raise ValueError("An entry has an id, and is in the layout once")
        if entry_id == "prefill":
            if set(entry) != {"id", "content", "enabled"} or not isinstance(entry["content"], str):
                raise ValueError("Start reply with is {id, content, enabled}")
            if len(entry["content"]) > longest or not isinstance(entry["enabled"], bool):
                raise ValueError(f"Start reply with is at most {longest} characters, enabled true or false")
        elif _OWN_PROMPT_ID.match(entry_id):
            own += 1
            depth = entry.get("depth")
            if (
                set(entry) != _OWN_PROMPT_KEYS
                or not isinstance(entry["name"], str)
                or len(entry["name"]) > MAX_NAME
                or not isinstance(entry["content"], str)
                or len(entry["content"]) > longest
                or entry["role"] not in ("system", "user", "assistant")
                or entry["position"] not in ("system", "depth")
                or isinstance(depth, bool)
                or not isinstance(depth, int)
                or not 0 <= depth <= PROMPT["own_prompt_depth"]
                or not isinstance(entry["enabled"], bool)
            ):
                raise ValueError(
                    "A prompt of your own is {id, name, content, role, position, depth, enabled, max_tokens}, in range"
                )
        elif entry_id in PROMPT["sections"]:
            if set(entry) != {"id", "enabled", "max_tokens"} or not isinstance(entry["enabled"], bool):
                raise ValueError("Each section is {id, enabled, max_tokens}")
        else:
            raise ValueError("A section is a known one, a prompt of your own, or start reply with")
        if "max_tokens" in entry:
            budget = entry["max_tokens"]
            if budget is not None and (
                isinstance(budget, bool) or not isinstance(budget, int) or not low <= budget <= high
            ):
                raise ValueError(f"A section's max_tokens is null or {low} to {high}")
        seen.add(entry_id)
    if own > PROMPT["own_prompts"]:
        raise ValueError(f"At most {PROMPT['own_prompts']} prompts of your own")
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
    @field_validator("injections", check_fields=False)
    @classmethod
    def _checked_injections(cls, value: Any) -> Any:
        """STscript's /inject injections (audit gap 5, Injections.py)."""
        problem = None if value is None else injections_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value

    @field_validator("narrator_style", check_fields=False)
    @classmethod
    def _checked_narrator_style(cls, value: Any) -> Any:
        """The narrator's sliders (NarratorStyle.py): each 0-1, or null for any."""
        problem = None if value is None else style_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value

    @field_validator("group_settings", check_fields=False)
    @classmethod
    def _checked_group_settings(cls, value: Any) -> Any:
        """A group's modes (audit gap 6, GroupSettings.py)."""
        problem = None if value is None else group_settings_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value

    @field_validator("variables", check_fields=False)
    @classmethod
    def _checked_variables(cls, value: Any) -> Any:
        """The chat's macro and STscript variables (audit gap 1): names to text, within the limits."""
        if value is None:
            return None
        longest = LIMITS["variable_value_characters"]
        if len(value) > LIMITS["chat_variables"] or any(
            not 1 <= len(name) <= MAX_NAME or not isinstance(text, str) or len(text) > longest
            for name, text in value.items()
        ):
            raise ValueError(
                f"At most {LIMITS['chat_variables']} variables, each named in at most {MAX_NAME} characters"
                f" and at most {LIMITS['variable_value_characters']} characters long"
            )
        return value

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
            if (
                set(note) != {"kind", "text"}
                or note["kind"] not in CONTRACT["table"]["note_kinds"]
                or not isinstance(text, str)
            ):
                raise ValueError(
                    f"A table note is {{kind, text}}, kind one of {', '.join(CONTRACT['table']['note_kinds'])}"
                )
            if not text.strip() or len(text.strip()) > LIMITS["short_text_characters"]:
                raise ValueError(f"A table note is 1 to {LIMITS['short_text_characters']} characters")
            cleaned.append({"kind": note["kind"], "text": text.strip()})
        return cleaned

    @field_validator("content_rating", check_fields=False)
    @classmethod
    def _checked_rating(cls, value: Any) -> Any:
        return _one_of(value, CONTRACT["safety"]["ratings"], "content_rating")

    @field_validator("seat", check_fields=False)
    @classmethod
    def _checked_seat(cls, value: Any) -> Any:
        return _one_of(value, CONTRACT["chat_seats"], "seat")

    @field_validator("lines", "veils", check_fields=False)
    @classmethod
    def _checked_safety_items(cls, value: Any) -> Any:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if isinstance(item, str)]
        if (
            len(cleaned) != len(value)
            or len(cleaned) > LIMITS["safety_items"]
            or any(not item or len(item) > LIMITS["short_text_characters"] for item in cleaned)
        ):
            raise ValueError(
                f"At most {LIMITS['safety_items']} items of 1 to {LIMITS['short_text_characters']} characters"
            )
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
            if (
                set(objective) != {"text", "done"}
                or not isinstance(text, str)
                or not isinstance(objective["done"], bool)
            ):
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
    vox_ids: list[str] = Field(
        default_factory=list, description="Cast members on vox: away from the scene, but a line can reach them"
    )
    canon_checks: bool = Field(True, description="Canon warnings on lines (off for a campaign that breaks canon)")
    narrator_style: dict[str, Any] = Field(
        default_factory=dict, description="The narrator's sliders (spice, verbosity, darkness, humour; absent: any)"
    )
    status_line: str = Field("", description="One spoiler-safe sentence on where the campaign stands")
    dispositions: dict[str, Any] = Field(
        default_factory=dict, description="Each person's stance toward each other person, with a short reason"
    )
    background: str | None = Field(None, description="A picture behind the chat (a data URL)")
    objectives: list[dict[str, Any]] = Field(
        default_factory=list, description="Its tasks in order; the first not done is put to the model"
    )
    content_rating: str | None = Field(None, description="general, teen or mature (null: none set)")
    seat: str | None = Field(
        None, description="The person's seat: player (an AI GM and an AI party) or gm (an AI party); null: a plain chat"
    )
    lines: list[str] = Field(default_factory=list, description="Never in the story, even off-screen")
    veils: list[str] = Field(default_factory=list, description="Only ever off-screen")
    table_notes: list[dict[str, Any]] = Field(
        default_factory=list, description="House rules, pacing, tone and reminders, read every turn"
    )
    campaign_id: str | None = Field(None, description="The campaign it belongs to; its frame is read every turn")
    scenario_id: str | None = Field(None, description="The scenario it runs; the GM's view of it is read every turn")
    paused: bool = Field(False, description="No story turns until the table resumes")
    variables: dict[str, str] = Field(
        default_factory=dict, description="The chat's macro and STscript variables, name to text"
    )
    group_settings: dict[str, Any] = Field(
        default_factory=dict, description="A group's modes: card mode, order, allow self, auto-reply, scenario"
    )
    injections: list[dict[str, Any]] = Field(
        default_factory=list, description="STscript's /inject injections, kept until flushed"
    )

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
        vox_ids: list[str] = Field(default_factory=list)
        canon_checks: bool = True
        narrator_style: dict[str, Any] = Field(default_factory=dict)
        status_line: str = Field("", max_length=200)
        dispositions: dict[str, Any] = Field(default_factory=dict)
        background: str | None = None
        objectives: list[dict[str, Any]] = Field(default_factory=list)
        content_rating: str | None = None
        seat: str | None = None
        lines: list[str] = Field(default_factory=list)
        veils: list[str] = Field(default_factory=list)
        table_notes: list[dict[str, Any]] = Field(default_factory=list)
        paused: bool = False
        campaign_id: str | None = None
        scenario_id: str | None = None
        variables: dict[str, str] = Field(default_factory=dict)
        group_settings: dict[str, Any] = Field(default_factory=dict)
        injections: list[dict[str, Any]] = Field(default_factory=list)

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
        vox_ids: list[str] | None = None
        canon_checks: bool | None = None
        narrator_style: dict[str, Any] | None = None
        status_line: str | None = Field(None, max_length=200)
        dispositions: dict[str, Any] | None = None
        background: str | None = None
        objectives: list[dict[str, Any]] | None = None
        content_rating: str | None = None
        seat: str | None = None
        lines: list[str] | None = None
        veils: list[str] | None = None
        table_notes: list[dict[str, Any]] | None = None
        paused: bool | None = None
        campaign_id: str | None = None
        scenario_id: str | None = None
        variables: dict[str, str] | None = None
        group_settings: dict[str, Any] | None = None
        injections: list[dict[str, Any]] | None = None

    class Search(ApplicationModel.Search):
        title: StringSearchModel | None = None


def background_place(entities: Sequence[Mapping[str, Any]], history: Sequence[Mapping[str, Any]], scenario: str) -> str:
    """A background's place: the wiki location the story names last (SceneLocation over the campaign's
    locations), else the chat's own scenario (lib/generate.ts backgroundPlace)."""
    locations = [
        {**entity, "aliases": list(entity.get("aliases") or [])}
        for entity in entities
        if entity.get("kind") == "location" and not entity.get("deleted")
    ]
    story = set(PROMPT["story_channels"])
    lines = [
        {"text": str(turn["content"]), "channel": "story" if turn["channel"] in story else str(turn["channel"])}
        for turn in history
    ]
    at = scene_location(lines, locations)
    location = next((entity for entity in locations if entity["id"] == at), None)
    return str((location or {}).get("summary") or "").strip() or scenario.strip()


#: A stream's first answer from the model, waited for before the response opens (errors keep their status).
FIRST_ANSWER_SECONDS = 5.0
#: How often a waiting stream says it's alive: an SSE comment, which the client's reader passes over.
HEARTBEAT_SECONDS = 10.0
HEARTBEAT = ": keepalive\n\n"


async def heartbeat_wait(task: Any, interval: float) -> AsyncIterator[Any]:
    """None every ``interval`` until ``task`` is done, then its result (its error raised)."""
    while True:
        done, _pending = await asyncio.wait({task}, timeout=interval)
        if done:
            yield task.result()
            return
        yield None


async def heartbeat_lines(upstream: Any, interval: float) -> AsyncIterator[str | None]:
    """The model's stream line by line, None for each ``interval`` that brings none (a heartbeat's turn)."""
    lines = upstream.aiter_lines().__aiter__()
    while True:
        task = asyncio.ensure_future(lines.__anext__())
        while True:
            done, _pending = await asyncio.wait({task}, timeout=interval)
            if done:
                break
            yield None
        try:
            line = task.result()
        except StopAsyncIteration:
            return
        yield line


async def heartbeat_iter(events: AsyncIterator[str], interval: float) -> AsyncIterator[str]:
    """A stream's pieces, with a heartbeat for each ``interval`` that brings none (a step's long pause)."""
    iterator = events.__aiter__()
    while True:
        task = asyncio.ensure_future(iterator.__anext__())
        while True:
            done, _pending = await asyncio.wait({task}, timeout=interval)
            if done:
                break
            yield HEARTBEAT
        try:
            piece = task.result()
        except StopAsyncIteration:
            return
        yield piece


async def store_picture(model_registry: Any, requester_id: str, name: str, image: str) -> str | None:
    """A drawn picture (a data URL) kept as the requester's asset through the framework's attachments
    (as POST /v1/asset/upload keeps one); its id, or None where attachments aren't loaded."""
    import base64
    import hashlib
    import uuid

    try:
        from zephyrex.extensions.attachments.BLL_Attachments import AssetManager
        from zephyrex.extensions.cloud.EXT_Cloud import EXT_Cloud
    except ImportError:
        return None
    head, _comma, data = image.partition(",")
    content = base64.b64decode(data) if data else b""
    if not content:
        return None
    content_type = head.removeprefix("data:").split(";")[0] or "image/png"
    path = f"attachments/{requester_id}/{uuid.uuid4().hex}"
    stored = await EXT_Cloud.upload_file(path=path, content=content)
    asset = AssetManager(requester_id=requester_id, model_registry=model_registry).create(
        name=f"{name}.png",
        content_type=content_type,
        size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        provider=str(stored["provider"]),
        path=str(stored.get("path", path)),
    )
    return str(asset.id)


def structured_retry(body: Mapping[str, Any], seat_name: str) -> dict[str, Any]:
    """A structured request asked once more after an answer with nothing to keep: its retry note just
    before the person's last line."""
    note = {"role": "system", "content": str(STRUCTURED["retry"]).replace("{{seat_name}}", seat_name or "the player")}
    messages = list(body.get("messages") or [])
    last = max((index for index, message in enumerate(messages) if message.get("role") == "user"), default=-1)
    messages = [*messages, note] if last == -1 else [*messages[:last], note, *messages[last:]]
    return {**body, "messages": messages}


#: The modes asked as structured turns (Structured.py): the narrator's, and a character's own turn.
STRUCTURED_MODES = ("narrate", "reply")


def structured_request(body: Mapping[str, Any], context: Mapping[str, Any]) -> dict[str, Any]:
    """A chat request asked for JSON items: the schema as response_format, its instruction just before the
    person's last line (SystemOrder.py), and no stop strings (the schema ends the turn)."""
    persona = context.get("persona")
    seat = str(persona["name"]) if persona is not None and context.get("playing_id") is not None else ""
    # A voice's turn is that character's items alone; the narrator's credits everyone.
    speaker = next((one["name"] for one in context.get("cast") or [] if one["id"] == context.get("speaker_id")), None)
    template = STRUCTURED["voice_instruction"] if speaker is not None else STRUCTURED["instruction"]
    content = str(template).replace("{{seat_name}}", seat or "the player").replace("{{char}}", str(speaker or ""))
    instruction = {"role": "system", "content": content}
    messages = list(body.get("messages") or [])
    last = max((index for index, message in enumerate(messages) if message.get("role") == "user"), default=-1)
    messages = [*messages, instruction] if last == -1 else [*messages[:last], instruction, *messages[last:]]
    asked = {key: value for key, value in body.items() if key != "stop"}
    return {
        **asked,
        "messages": messages,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": STRUCTURED["schema_name"], "schema": turn_schema(), "strict": True},
        },
    }


def wiki_campaign_for(frames: Any, campaign_id: str | None) -> str | None:
    """A chat's wiki campaign: its campaign_id, or, while campaign frames remain, the wiki campaign of
    the frame it names (WorldLore.wiki_campaign_of). Remove with the frames."""
    if campaign_id is None:
        return None
    try:
        frame = frames.get(id=campaign_id)
    except HTTPException:
        return campaign_id
    wiki: str | None = wiki_campaign_of(campaign_id, {campaign_id: getattr(frame, "wiki_campaign_id", None)})
    return wiki


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

    def _check_references(self, fields: dict[str, Any], current_campaign: str | None = None) -> None:
        # A chat's characters are wiki persons (the composed suite), ones the requester can see.
        campaign = fields.get("campaign_id") or current_campaign
        for field in ("character_ids", "muted_ids", "vox_ids"):
            if fields.get(field):
                self._check_persons(list(fields[field]), field, campaign)
        for book_id in fields.get("lorebook_ids") or []:
            self._owned(LorebookManager, book_id, "lorebook_ids")
        for field, manager in (
            ("persona_id", PersonaManager),
            ("preset_id", GenerationPresetManager),
            ("endpoint_id", ModelEndpointManager),
            ("scenario_id", ScenarioManager),
        ):
            if fields.get(field) is not None:
                self._owned(manager, fields[field], field)
        if fields.get("campaign_id") is not None:
            self._check_campaign(fields["campaign_id"])

    def _check_persons(self, ids: list[str], field: str, campaign_id: str | None) -> None:
        """Every id is a wiki person the requester can see: in the chat's campaign, or read by id
        through the wiki (world_entities_by_id, when the wiki has it); the framework's 422 otherwise."""
        wiki = wiki_campaign_for(self._sibling(CampaignFrameManager), campaign_id)
        seen = {
            str(entity["id"])
            for entity in persons_for(self.model_registry, str(self.requester.id), wiki, ids)
            if entity.get("kind") == "person" and not entity.get("deleted")
        }
        if any(id_ not in seen for id_ in ids):
            raise not_yours(field)

    def _check_campaign(self, campaign_id: str) -> None:
        """A chat's campaign is a wiki campaign the requester can see (the composed suite), asked of the
        wiki's own world_entities ability; or, while frames remain, one of their campaign frames."""
        try:
            self._sibling(CampaignFrameManager).get(id=campaign_id)
            return
        except HTTPException:
            pass
        read = loaded_ability(self.model_registry, "rpg_core", "world_entities")
        if read is None:
            raise not_yours("campaign_id")
        try:
            page = read(self.model_registry, str(self.requester.id), campaign_id, limit=1)
        except HTTPException as error:
            raise not_yours("campaign_id") from error
        if inspect.isawaitable(page):
            close = getattr(page, "close", None)
            if callable(close):
                close()

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
        kwargs.setdefault("vox_ids", [])
        kwargs.setdefault("canon_checks", True)
        kwargs.setdefault("narrator_style", {})
        kwargs.setdefault("status_line", "")
        kwargs.setdefault("dispositions", {})
        kwargs.setdefault("objectives", [])
        kwargs.setdefault("variables", {})
        kwargs.setdefault("group_settings", {})
        kwargs.setdefault("injections", [])
        kwargs.setdefault("lines", [])
        kwargs.setdefault("veils", [])
        kwargs.setdefault("table_notes", [])
        kwargs.setdefault("paused", False)
        self._check_references(kwargs)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_references(kwargs, getattr(self.get(id=id), "campaign_id", None))
        return super().update(id, **kwargs)

    def delete(self, id: str) -> None:
        # A chat's messages go with it.
        messages = ChatMessageManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        for message in messages.list(chat_id=id):
            ChatMessageManager.delete_one(messages, message.id)
        timers = ChatLoreStateManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        for state in timers.list(chat_id=id):
            timers.delete(state.id)
        # And its memories (A19).
        forget_chat(MemoryManager(requester_id=str(self.requester.id), model_registry=self.model_registry), id)
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
    hidden: bool = Field(False, description="Hidden by the person (/hide): kept on screen, never read by the model")

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
        hidden: bool | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None


class ChatMessageManager(AbstractBLLManager[ChatMessageModel], RouterMixin):
    _model = ChatMessageModel

    def _invalid(self, field: str, message: str) -> HTTPException:
        return HTTPException(
            status_code=422,
            detail={
                "message": "Validation error",
                "code": "validation_error",
                "errors": [{"loc": [field], "msg": message}],
            },
        )

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("channel", "ic")
        kwargs.setdefault("swipe_index", 0)
        kwargs.setdefault("bookmarked", False)
        kwargs.setdefault("images", [])
        kwargs.setdefault("x_carded", False)
        kwargs.setdefault("hidden", False)
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
        swipes: list[str] = kwargs["swipes"] if kwargs.get("swipes") is not None else (current.swipes or [])
        index: int = kwargs["swipe_index"] if kwargs.get("swipe_index") is not None else (current.swipe_index or 0)
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
    @field_validator(
        "temperature", "top_p", "top_k", "repetition_penalty", "max_tokens", "context_tokens", check_fields=False
    )
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

    @field_validator("logit_bias", check_fields=False)
    @classmethod
    def _checked_bias(cls, value: Any) -> Any:
        extras = CONTRACT["sampler_extras"]
        low, high = extras["logit_bias_range"]
        if value is not None and (
            len(value) > extras["logit_bias_entries"]
            or any(
                not key.isdigit() or isinstance(bias, bool) or not low <= bias <= high for key, bias in value.items()
            )
        ):
            raise ValueError(
                f"At most {extras['logit_bias_entries']} token ids (whole numbers), each biased {low} to {high}"
            )
        return value

    @field_validator("guidance_scale", check_fields=False)
    @classmethod
    def _checked_guidance(cls, value: Any) -> Any:
        low, high = CONTRACT["sampler_extras"]["guidance_scale_range"]
        if value is not None and not low <= value <= high:
            raise ValueError(f"guidance_scale is {low} to {high}")
        return value

    @field_validator("samplers", check_fields=False)
    @classmethod
    def _checked_samplers(cls, value: Any) -> Any:
        problem = None if value is None else sampler_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value


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
    prompt_layout: list[dict[str, Any]] = Field(
        default_factory=list, description="The prompt manager's sections, in order"
    )
    logit_bias: dict[str, float] = Field(
        default_factory=dict, description="Token id to bias, for chat APIs that take it"
    )
    negative_prompt: str = Field("", description="What classifier-free guidance steers away from")
    guidance_scale: float | None = Field(None, description="How hard guidance steers (null: none)")
    samplers: dict[str, Any] = Field(
        default_factory=dict, description="SillyTavern's further samplers (audit gap 2): only the ones set"
    )

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
        logit_bias: dict[str, float] = Field(default_factory=dict)
        negative_prompt: str = Field("", max_length=LIMITS["card_field_characters"])
        guidance_scale: float | None = None
        samplers: dict[str, Any] = Field(default_factory=dict)

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
        logit_bias: dict[str, float] | None = None
        negative_prompt: str | None = Field(None, max_length=LIMITS["card_field_characters"])
        guidance_scale: float | None = None
        samplers: dict[str, Any] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class GenerationPresetManager(AbstractBLLManager[GenerationPresetModel], RouterMixin):
    _model = GenerationPresetModel

    def create(self, **kwargs: Any) -> Any:
        # Scalar defaults are written; the list's must be explicit.
        kwargs.setdefault("stop", [])
        kwargs.setdefault("prompt_layout", [])
        kwargs.setdefault("logit_bias", {})
        kwargs.setdefault("negative_prompt", "")
        kwargs.setdefault("samplers", {})
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
        return _one_of(value, [*CONTRACT["endpoint_apis"], *CONTRACT["search_apis"]], "api")

    @model_validator(mode="after")
    def _search_serves_search_alone(self) -> Any:
        """A search source (A42) serves search alone, and only a search source serves search."""
        api, roles = getattr(self, "api", None), getattr(self, "roles", None)
        if api is None or roles is None:
            return self
        if api in CONTRACT["search_apis"] and list(roles) != ["search"]:
            raise ValueError("A search source serves only the search role")
        if api not in CONTRACT["search_apis"] and "search" in roles:
            raise ValueError("Only a search source (searxng, brave) serves the search role")
        return self

    @field_validator("traits", check_fields=False)
    @classmethod
    def _checked_traits(cls, value: Any) -> Any:
        """Its reputation (NarratorStyle.py), over the seeds in contract/model-traits.json."""
        problem = None if value is None else traits_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value

    @field_validator("extra_body", check_fields=False)
    @classmethod
    def _checked_extra_body(cls, value: Any) -> Any:
        problem = None if value is None else extra_body_problem(value)
        if problem is not None:
            raise ValueError(problem)
        return value

    @field_validator("roles", check_fields=False)
    @classmethod
    def _checked_roles(cls, value: Any) -> Any:
        if value is not None and (
            len(set(value)) != len(value) or any(role not in CONTRACT["endpoint_roles"] for role in value)
        ):
            raise ValueError(f"roles are {', '.join(CONTRACT['endpoint_roles'])}, each once")
        return value

    @field_validator("image_size", check_fields=False)
    @classmethod
    def _checked_image_size(cls, value: Any) -> Any:
        if value in (None, ""):
            return value
        return _one_of(value, CONTRACT["picture"]["sizes"], "image_size")

    @field_validator("instruct_template", check_fields=False)
    @classmethod
    def _checked_template(cls, value: Any) -> Any:
        return _one_of(value, list(CONTRACT["instruct_templates"]), "instruct_template")


# ---- instruct_template (A17) -------------------------------------------------------------

CUSTOM = CONTRACT["instruct_custom"]


class InstructTemplateChecks(PlainModel):
    @field_validator("stop", check_fields=False)
    @classmethod
    def _checked_stop(cls, value: Any) -> Any:
        if value is not None and (
            len(value) > CUSTOM["stops"] or any(not item or len(item) > CUSTOM["stop_characters"] for item in value)
        ):
            raise ValueError(
                f"At most {CUSTOM['stops']} stop strings, each 1 to {CUSTOM['stop_characters']} characters"
            )
        return value


class InstructTemplateModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    """A person's own instruct template (A17): the markup a text API's model was trained on."""

    Manager: ClassVar[type["InstructTemplateManager"]]
    name: str = Field(..., description="Name")
    start: str = Field("", description="Before everything")
    system_prefix: str = Field("", description="Before a system message")
    system_suffix: str = Field("", description="After a system message")
    user_prefix: str = Field("", description="Before a user message")
    user_suffix: str = Field("", description="After a user message")
    assistant_prefix: str = Field("", description="Before a reply")
    assistant_suffix: str = Field("", description="After a reply")
    stop: list[str] = Field(default_factory=list, description="Where the model's reply ends")
    include_names: bool = Field(False, description="Every turn named (SillyTavern's Include Names)")
    activation_regex: str = Field("", description="Used for an endpoint whose model's name this matches")
    story_string: str = Field("", description="SillyTavern's context template: the story in place of the card")
    example_separator: str = Field("", description="Before the example dialogue")
    chat_start: str = Field("", description="After the story, before the chat")

    table_comment: ClassVar[str] = "Zephyrex RPG AI instruct templates"

    class Create(InstructTemplateChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        start: str = Field("", max_length=CUSTOM["field_characters"])
        system_prefix: str = Field("", max_length=CUSTOM["field_characters"])
        system_suffix: str = Field("", max_length=CUSTOM["field_characters"])
        user_prefix: str = Field("", max_length=CUSTOM["field_characters"])
        user_suffix: str = Field("", max_length=CUSTOM["field_characters"])
        assistant_prefix: str = Field("", max_length=CUSTOM["field_characters"])
        assistant_suffix: str = Field("", max_length=CUSTOM["field_characters"])
        stop: list[str] = Field(default_factory=list)
        include_names: bool = False
        activation_regex: str = Field("", max_length=CUSTOM["activation_regex_characters"])
        story_string: str = Field("", max_length=CUSTOM["story_characters"])
        example_separator: str = Field("", max_length=CUSTOM["field_characters"])
        chat_start: str = Field("", max_length=CUSTOM["field_characters"])

    class Update(InstructTemplateChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        start: str | None = Field(None, max_length=CUSTOM["field_characters"])
        system_prefix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        system_suffix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        user_prefix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        user_suffix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        assistant_prefix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        assistant_suffix: str | None = Field(None, max_length=CUSTOM["field_characters"])
        stop: list[str] | None = None
        include_names: bool | None = None
        activation_regex: str | None = Field(None, max_length=CUSTOM["activation_regex_characters"])
        story_string: str | None = Field(None, max_length=CUSTOM["story_characters"])
        example_separator: str | None = Field(None, max_length=CUSTOM["field_characters"])
        chat_start: str | None = Field(None, max_length=CUSTOM["field_characters"])

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class InstructTemplateManager(AbstractBLLManager[InstructTemplateModel], RouterMixin):
    _model = InstructTemplateModel

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("stop", [])
        kwargs.setdefault("include_names", False)
        for field in ("activation_regex", "story_string", "example_separator", "chat_start"):
            kwargs.setdefault(field, "")
        return super().create(**kwargs)


def template_fields(row: Any) -> dict[str, Any]:
    """A stored template as the twins' render_instruct reads one, with SillyTavern's context template
    and Include Names (audit gap 4)."""
    context = {field: getattr(row, field, "") or "" for field in ("story_string", "example_separator", "chat_start")}
    return (
        {field: getattr(row, field) or "" for field in CUSTOM["fields"]}
        | {"stop": list(row.stop or []), "include_names": bool(getattr(row, "include_names", False))}
        | context
    )


class ModelEndpointModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ModelEndpointManager"]]
    name: str = Field(..., description="Name")
    base_url: str = Field(..., description="The endpoint's OpenAI-compatible address")
    model: str = Field(..., description="The model to ask")
    is_default: bool = Field(False, description="Used by chats that name no model")
    api: str = Field("chat", description="chat (chat completions) or text (one prompt in the instruct template)")
    roles: list[str] = Field(default_factory=list, description="What it is used for: story, gm, summary, translate")
    instruct_template: str = Field("chatml", description="A text API's prompt markup")
    custom_template_id: str | None = Field(
        None, description="The person's own template (A17), used in place of instruct_template"
    )
    image_size: str = Field("", description="The size it is asked to draw at (A30); empty for the contract's default")
    extra_body: dict[str, Any] = Field(
        default_factory=dict, description="Extra request fields, merged into each request it's sent"
    )
    traits: dict[str, Any] = Field(
        default_factory=dict, description="Its reputation as a narrator, over the contract's seeds for its model"
    )
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
        custom_template_id: str | None = None
        image_size: str = ""
        roles: list[str] = Field(default_factory=list)
        extra_body: dict[str, Any] = Field(default_factory=dict)
        traits: dict[str, Any] = Field(default_factory=dict)

    class Update(EndpointChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        base_url: str | None = Field(None, min_length=1, max_length=MAX_URL)
        model: str | None = Field(None, min_length=1, max_length=MAX_MODEL)
        api_key: str | None = Field(None, max_length=MAX_STORED_KEY)
        has_api_key: bool | None = None
        is_default: bool | None = None
        api: str | None = None
        instruct_template: str | None = None
        custom_template_id: str | None = None
        image_size: str | None = None
        roles: list[str] | None = None
        extra_body: dict[str, Any] | None = None
        traits: dict[str, Any] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


def _keyed(fields: dict[str, Any]) -> dict[str, Any]:
    """The write with its API key encrypted (an empty key clears it) and ``has_api_key`` set from
    it; a ``has_api_key`` the client sent is dropped."""
    fields.pop("has_api_key", None)
    raw = fields.get("api_key")
    if isinstance(raw, str) and len(raw) > MAX_KEY:
        raise HTTPException(
            status_code=422,
            detail={"message": f"An API key is at most {MAX_KEY} characters", "code": "validation_error"},
        )
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

    def _check_custom_template(self, template_id: Any) -> None:
        """A custom template (A17) must be one of the requester's own."""
        if not template_id:
            return
        try:
            InstructTemplateManager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(
                id=template_id
            )
        except HTTPException as error:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Validation error",
                    "code": "validation_error",
                    "errors": [{"loc": ["custom_template_id"], "msg": "Not one of your instruct templates"}],
                },
            ) from error

    def create(self, **kwargs: Any) -> Any:
        kwargs.setdefault("is_default", False)
        # JSON columns get no column default: an unset list is stored as [] (as every manager here does).
        kwargs.setdefault("roles", [])
        kwargs.setdefault("extra_body", {})
        kwargs.setdefault("traits", {})
        self._check_custom_template(kwargs.get("custom_template_id"))
        if kwargs["is_default"]:
            self._clear_other_defaults(None)
        return super().create(**{"has_api_key": False, **_keyed(kwargs)})

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_custom_template(kwargs.get("custom_template_id"))
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
    if value is not None and (
        not value or len(set(value)) != len(value) or any(one not in REGEX["placements"] for one in value)
    ):
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
        for key, value in (
            ("replace", ""),
            ("placements", ["ai_output"]),
            ("display_only", False),
            ("prompt_only", False),
            ("enabled", True),
            ("position", 0),
        ):
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

    @field_validator("auto_run", check_fields=False)
    @classmethod
    def _checked_auto_run(cls, value: Any) -> Any:
        return _one_of(value, QUICK["auto_runs"], "auto_run")


def quick_reply_loops(action: str, auto_run: str) -> bool:
    """Whether a quick reply would run without end (A38): one that sends, run after a send or a reply."""
    return action == "send" and auto_run not in QUICK["sending_auto_runs"]


QUICK_LOOP_MESSAGE = "A quick reply that runs after a send or a reply can only fill the composer"


class QuickReplyModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["QuickReplyManager"]]
    label: str = Field(..., description="The button's label")
    message: str = Field(..., description="The line it sends or fills in ({{char}} and {{user}} filled)")
    action: str = Field("send", description="send, or fill in the composer")
    channel: str = Field("ic", description="ic (the story) or ooc (table talk)")
    enabled: bool = Field(True, description="Whether it shows")
    position: int = Field(0, description="Buttons show in this order")
    auto_run: str = Field("none", description="When it runs by itself: none, chat_open, after_send or after_reply")

    table_comment: ClassVar[str] = "Zephyrex RPG AI quick replies"

    class Create(QuickReplyChecks, BaseModel):
        label: str = Field(..., min_length=1, max_length=LIMITS["quick_reply_label_characters"])
        message: str = Field(..., min_length=1, max_length=LIMITS["message_characters"])
        action: str = "send"
        channel: str = "ic"
        enabled: bool = True
        position: int = Field(0, ge=0, le=LIMITS["quick_replies"])
        auto_run: str = "none"

    class Update(QuickReplyChecks, BaseModel):
        label: str | None = Field(None, min_length=1, max_length=LIMITS["quick_reply_label_characters"])
        message: str | None = Field(None, min_length=1, max_length=LIMITS["message_characters"])
        action: str | None = None
        channel: str | None = None
        enabled: bool | None = None
        position: int | None = Field(None, ge=0, le=LIMITS["quick_replies"])
        auto_run: str | None = None

    class Search(ApplicationModel.Search):
        label: StringSearchModel | None = None


class QuickReplyManager(AbstractBLLManager[QuickReplyModel], RouterMixin):
    _model = QuickReplyModel

    def _invalid(self, field: str, message: str) -> HTTPException:
        return HTTPException(
            status_code=422,
            detail={
                "message": "Validation error",
                "code": "validation_error",
                "errors": [{"loc": [field], "msg": message}],
            },
        )

    def create(self, **kwargs: Any) -> Any:
        for key, value in (
            ("action", "send"),
            ("channel", "ic"),
            ("enabled", True),
            ("position", 0),
            ("auto_run", "none"),
        ):
            kwargs.setdefault(key, value)
        if quick_reply_loops(kwargs["action"], kwargs["auto_run"]):
            raise self._invalid("auto_run", QUICK_LOOP_MESSAGE)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        current = self.get(id=id)
        action: str = kwargs["action"] if kwargs.get("action") is not None else (current.action or "")
        auto_run: str = kwargs["auto_run"] if kwargs.get("auto_run") is not None else (current.auto_run or "none")
        if quick_reply_loops(action, auto_run):
            raise self._invalid("auto_run", QUICK_LOOP_MESSAGE)
        return super().update(id, **kwargs)

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
                manager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(
                    id=kwargs["scope_id"]
                )
            except HTTPException as error:
                raise not_yours("scope_id") from error
        return super().create(**kwargs)


# ---- generation ------------------------------------------------------------------------


class GenerateRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    speaker_id: str | None = None
    mode: str = "reply"
    # AP4: this turn asked of another of the person's models, to compare (kept as another swipe).
    endpoint_id: str | None = None
    # A regeneration after the voice guard (VoiceGuard.py) caught a span: {names, span}, forbidden.
    forbid: dict[str, Any] | None = None
    # Schema-constrained (Structured.py): the model answers JSON items, streamed as item events and saved
    # by the server, one message per speaker run. Prose from a model that ignores the schema streams as deltas.
    structured: bool = False

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


class GenRequest(PlainModel):
    """STscript's /gen and /genraw (audit gap 5): an instruction for the chat's model."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    speaker_id: str | None = None
    prompt: str = Field(..., min_length=1, max_length=LIMITS["gen_prompt_characters"])
    #: The instruction alone (/genraw), not after the chat's prompt.
    raw: bool = False

    @field_validator("prompt")
    @classmethod
    def _checked_prompt(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A prompt is required")
        return value.strip()


class GenRequestEnvelope(PlainModel):
    gen: GenRequest


class GenAnswer(PlainModel):
    text: str


class GenEnvelope(PlainModel):
    gen: GenAnswer


class TranslateRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=LIMITS["translate_characters"])
    #: A language as people name it ("French", "fr-CA"): the model reads it.
    language: str = Field(..., min_length=1, max_length=LIMITS["language_characters"])


class TranslateEnvelope(PlainModel):
    translate: TranslateRequest


class ExpressionRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    character_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=LIMITS["message_characters"])


class ExpressionRequestEnvelope(PlainModel):
    expression: ExpressionRequest


class Expression(PlainModel):
    label: str | None


class ExpressionEnvelope(PlainModel):
    expression: Expression


class MoveRequest(PlainModel):
    message_id: str = Field(..., min_length=1)


class MoveRequestEnvelope(PlainModel):
    move: MoveRequest


class Moved(PlainModel):
    message_id: str


class MovedEnvelope(PlainModel):
    move: Moved


class NextTurnRequest(PlainModel):
    """Who speaks next, by the decision model (the operator, 2026-11-21)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class NextTurnRequestEnvelope(PlainModel):
    next_turn: NextTurnRequest


class NextTurn(PlainModel):
    #: False (the caller keeps its turn order) without a decision model or a usable answer.
    decided: bool
    #: character, gm or pause.
    kind: str | None = None
    character_id: str | None = None


class NextTurnEnvelope(PlainModel):
    next_turn: NextTurn


class NeedsRollRequest(PlainModel):
    """Whether a character's action needs a roll, and which (the operator, 2026-11-21; DESIGN's needs_roll)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    character_id: str = Field(..., min_length=1)


class NeedsRollRequestEnvelope(PlainModel):
    needs_roll: NeedsRollRequest


class NeedsRoll(PlainModel):
    #: False (no roll step) without a decision model or a usable answer.
    decided: bool
    #: none, test (the system pack's, rolled by the VTT's test) or formula (the light dice style).
    kind: str | None = None
    person_id: str | None = None
    name: str | None = None
    difficulty: str | None = None
    formula: str | None = None
    label: str | None = None
    #: "system" when the roll is the campaign's system's own test; mechanics are never a model's.
    source: str | None = None


class NeedsRollEnvelope(PlainModel):
    needs_roll: NeedsRoll


class WorldTickRequest(PlainModel):
    """In-world time passes and NPCs go about their routines (the operator, 2026-11-21)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    minutes: int = Field(..., ge=1, le=525_600)
    reason: str = Field("", max_length=200)


class WorldTickRequestEnvelope(PlainModel):
    world_tick: WorldTickRequest


class WorldTick(PlainModel):
    #: True (and nothing moved) without a wiki campaign, or for anyone but its GM.
    skipped: bool
    reason: str | None = None
    now: dict[str, Any] | None = None
    moves: list[dict[str, Any]] = Field(default_factory=list)
    #: Who came into the party's scene, for the caller to narrate.
    arrivals: list[str] = Field(default_factory=list)


class WorldTickEnvelope(PlainModel):
    world_tick: WorldTick


class ClarifyRequest(PlainModel):
    """The GM's question when the person's action is ambiguous (the operator, 2026-11-21)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class ClarifyRequestEnvelope(PlainModel):
    clarify: ClarifyRequest


class ClarifyEnvelope(PlainModel):
    #: The question and its options (those present), or None: nothing to ask.
    clarify: dict[str, Any] | None = None


class NpcNeededRequest(PlainModel):
    """Whether the person's latest line meets someone who must be authored first (the operator, 2026-11-22)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class NpcNeededRequestEnvelope(PlainModel):
    npc_needed: NpcNeededRequest


class NpcNeeded(PlainModel):
    needed: bool
    name: str | None = None
    role: str | None = None
    reason: str = ""


class NpcNeededEnvelope(PlainModel):
    npc_needed: NpcNeeded


class AuthorNpcRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None
    name: str = Field(..., min_length=1, max_length=MAX_NAME)
    role: str = Field("", max_length=200)


class AuthorNpcRequestEnvelope(PlainModel):
    author_npc: AuthorNpcRequest


class MapStepRequest(PlainModel):
    """The map follows the story's movements (the operator, 2026-11-21)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class MapStepRequestEnvelope(PlainModel):
    map_step: MapStepRequest


class MapStep(PlainModel):
    skipped: bool
    reason: str | None = None
    #: Each move applied: person_id, from, to and to_name.
    moves: list[dict[str, Any]] = Field(default_factory=list)
    #: The banner's place, server truth: where the seat's character is after the round ({id, name}), or None.
    seat_location: dict[str, str] | None = None
    #: Whether this round moved the seat's character: show the banner.
    seat_moved: bool = False


class MapStepEnvelope(PlainModel):
    map_step: MapStep


class StatusLineRequest(PlainModel):
    """A campaign's spoiler-safe status line, rewritten (the operator, 2026-11-21)."""

    chat_id: str = Field(..., min_length=1)
    leaf_id: str | None = None


class StatusLineRequestEnvelope(PlainModel):
    status_line: StatusLineRequest


class StatusLineText(PlainModel):
    text: str
    #: How many stances the call changed.
    stances: int = 0


class StatusLineEnvelope(PlainModel):
    status_line: StatusLineText


class EnsurePersonRequest(PlainModel):
    """Someone the narrator voiced who isn't a person yet (the operator's play-test: the barkeep)."""

    chat_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=MAX_NAME)
    line: str = Field("", max_length=2000)


class EnsurePersonRequestEnvelope(PlainModel):
    ensure_person: EnsurePersonRequest


class EnsuredPerson(PlainModel):
    id: str
    name: str
    created: bool = False


class EnsurePersonEnvelope(PlainModel):
    ensure_person: EnsuredPerson


class CutRequest(PlainModel):
    """STscript's /cut (audit gap 5): the messages to take out, all of one chat."""

    message_ids: list[str] = Field(..., min_length=1, max_length=LIMITS["cut_messages"])


class CutRequestEnvelope(PlainModel):
    cut: CutRequest


class CutEnvelope(PlainModel):
    cut: CutRequest


# What a message is, as against where it sits in the tree: what moving it up swaps with its parent (A9).
MOVED_FIELDS = (
    "role",
    "channel",
    "speaker_character_id",
    "swipes",
    "swipe_index",
    "bookmarked",
    "images",
    "x_carded",
    "hidden",
)


class PictureRequest(PlainModel):
    """What to draw (A30): a scene or a background for ``chat_id``, or a portrait of ``character_id``."""

    kind: str = "scene"
    chat_id: str | None = Field(None, min_length=1)
    character_id: str | None = Field(None, min_length=1)
    leaf_id: str | None = None
    prompt: str = Field("", max_length=CONTRACT["picture"]["prompt_characters"])

    @field_validator("kind")
    @classmethod
    def _known_kind(cls, kind: str) -> str:
        if kind not in CONTRACT["picture"]["kinds"]:
            raise ValueError(f"kind is one of {', '.join(CONTRACT['picture']['kinds'])}")
        return kind

    @model_validator(mode="after")
    def _names_its_subject(self) -> "PictureRequest":
        if (self.kind == "portrait" and self.character_id is None) or (
            self.kind != "portrait" and self.chat_id is None
        ):
            raise ValueError("A portrait names a character_id; a scene or background a chat_id")
        return self


class PictureRequestEnvelope(PlainModel):
    picture: PictureRequest


class Picture(PlainModel):
    prompt: str
    image: str


class PictureEnvelope(PlainModel):
    picture: Picture


class SearchRequest(PlainModel):
    query: str = Field(..., min_length=1, max_length=SEARCH_QUERY_CHARACTERS)

    @field_validator("query")
    @classmethod
    def _not_blank(cls, query: str) -> str:
        if not query.strip():
            raise ValueError("A query is required")
        return query.strip()


class SearchRequestEnvelope(PlainModel):
    search: SearchRequest


class SearchResultItem(PlainModel):
    title: str
    url: str
    snippet: str


class SearchAnswer(PlainModel):
    query: str
    results: list[SearchResultItem]
    context: str


class SearchEnvelope(PlainModel):
    search: SearchAnswer


class SpeechRequest(PlainModel):
    text: str = Field(..., min_length=1, max_length=SPEECH["text_characters"])
    voice: str | None = Field(None, min_length=1, max_length=SPEECH["voice_characters"])
    speed: float = Field(1.0, ge=SPEECH["speed_range"][0], le=SPEECH["speed_range"][1])

    @field_validator("text")
    @classmethod
    def _something_to_say(cls, value: str) -> str:
        if value.strip() == "":
            raise ValueError("There is nothing to read aloud")
        return value


class SpeechRequestEnvelope(PlainModel):
    speech: SpeechRequest


class Speech(PlainModel):
    audio: str


class SpeechEnvelope(PlainModel):
    speech: Speech


class PingRequest(PlainModel):
    endpoint_id: str = Field(..., min_length=1)


class PingRequestEnvelope(PlainModel):
    ping: PingRequest


class Ping(PlainModel):
    ok: bool
    latency_ms: int
    status: int | None
    has_model: bool | None
    detail: str


class PingEnvelope(PlainModel):
    ping: Ping


PING_TIMEOUT_SECONDS = 8.0


def images_url(base_url: str) -> str:
    """The address a server draws pictures at (OpenAI-compatible ``POST /images/generations``)."""
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/")) + "/images/generations"


def picture_of(answer: Any) -> str | None:
    """The picture in an image model's answer, as a data URL: its ``b64_json``, or a ``url`` that is
    already a data URL. A link elsewhere is not fetched (the server never follows a model's links)."""
    first = (
        answer.get("data", [None])[0]
        if isinstance(answer, dict) and isinstance(answer.get("data"), list) and answer["data"]
        else None
    )
    if not isinstance(first, dict):
        return None
    b64 = first.get("b64_json")
    if isinstance(b64, str) and b64:
        return "data:image/png;base64," + b64
    url = first.get("url")
    return url if isinstance(url, str) and url.startswith("data:image/") else None


def models_url(base_url: str) -> str:
    """The address a server lists its models at (OpenAI-compatible ``GET /models``)."""
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/")) + "/models"


class GenerateEnvelope(PlainModel):
    generate: GenerateRequest


def completions_url(base_url: str, api: str = "chat") -> str:
    """The endpoint's completions URL: its base with ``/chat/completions`` (``/completions`` for a text API) once."""
    # Whichever completions path it was given, the one this API takes (a text API's "/completions"
    # is also the tail of "/chat/completions", so the path is replaced, never just kept).
    path = "/chat/completions" if api == "chat" else "/completions"
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/")) + path


def with_images(messages: list[dict[str, str]], images: Sequence[str]) -> list[dict[str, Any]]:
    """The messages with ``images`` added to the last user message as OpenAI-style content parts
    (A44), for a vision model; unchanged when there are none."""
    if not images:
        return list(messages)
    last = max((index for index, message in enumerate(messages) if message["role"] == "user"), default=-1)
    return [
        {
            "role": message["role"],
            "content": [
                {"type": "text", "text": message["content"]},
                *({"type": "image_url", "image_url": {"url": url}} for url in images),
            ],
        }
        if index == last
        else message
        for index, message in enumerate(messages)
    ]


def macro_context(
    chat: Any, path: Sequence[Any], cast: Sequence[Mapping[str, Any]], speaker_id: str, persona: Any, model: str
) -> dict[str, Any]:
    """What SillyTavern's macros read in a reply's prompt (audit gap 1), as lib/generate.ts's
    macroContext: the speaker's card and the persona, the group, the branch's last lines, how long since
    the person's last line, the clock (UTC: the server doesn't know the person's zone), a random source,
    and the chat's variables."""
    speaker = next((character for character in cast if character["id"] == speaker_id), None)
    user_name = persona["name"] if persona is not None else DEFAULT_USER_NAME
    lines = [message for message in path if message.channel in PROMPT["story_channels"]]

    def last_of(role: str | None = None) -> Any:
        return next((message for message in reversed(lines) if role is None or message.role == role), None)

    def text_of(message: Any) -> str:
        if message is None or message.swipe_index >= len(message.swipes):
            return ""
        return str(message.swipes[message.swipe_index])

    last_user = last_of("user")
    now = datetime.now(UTC)
    chat_context: dict[str, Any] = {
        "chat_id": chat.id,
        "last_message": text_of(last_of()),
        "last_user_message": text_of(last_user),
        "last_char_message": text_of(last_of("character")),
        "last_message_id": path[-1].id if path else "",
    }
    if last_user is not None and getattr(last_user, "created_at", None) is not None:
        created = last_user.created_at if last_user.created_at.tzinfo else last_user.created_at.replace(tzinfo=UTC)
        chat_context["idle_seconds"] = max(0.0, (now - created).total_seconds())
    return {
        "group": ", ".join(character["name"] for character in cast) if len(cast) > 1 else "",
        "not_char": ", ".join([*(character["name"] for character in cast if character["id"] != speaker_id), user_name]),
        "fields": {
            "persona": persona["description"] if persona is not None else "",
            "description": speaker["description"] if speaker else "",
            "personality": speaker["personality"] if speaker else "",
            "scenario": speaker["scenario"] if speaker else "",
            "mesExamples": speaker["example_messages"] if speaker else "",
            "charPrompt": speaker["system_prompt"] if speaker else "",
            "charInstruction": speaker["post_history_instructions"] if speaker else "",
            "model": model,
        },
        "chat": chat_context,
        "now": {"epoch_ms": now.timestamp() * 1000, "utc_offset_minutes": 0},
        "random": random.random,
        "local": dict(chat.variables or {}),
    }


def upstream_request(endpoint: Any, key: str, body: dict[str, Any]) -> dict[str, Any]:
    """Where and how a model is asked (``url``, ``headers``, ``json``): an OpenAI-compatible endpoint
    as the body is; Anthropic's and Google's own APIs in their shape (audit gap 8, NativeApis.py)."""
    # The endpoint's extra request fields go last, over everything but the conversation's own.
    extra = getattr(endpoint, "extra_body", None)
    if endpoint.api in NATIVE_APIS:
        native: dict[str, Any] = native_request(endpoint.api, endpoint.base_url, key, body)
        return {**native, "json": with_extra_body(native["json"], extra)}
    return {
        "url": completions_url(endpoint.base_url, endpoint.api or "chat"),
        "headers": {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
        "json": with_extra_body(body, extra),
    }


def as_openai_payload(api: str | None, payload: str) -> str | None:
    """A stream payload as the one reader takes it: an OpenAI-compatible endpoint's as it is; a native
    API's rewritten as an OpenAI chunk, or None when it adds nothing (audit gap 8)."""
    if api not in NATIVE_APIS:
        return payload
    rewritten: str | None = openai_payload(str(api), payload)
    return rewritten


def upstream_body(
    endpoint: Any,
    sampler: Mapping[str, Any],
    messages: list[dict[str, str]],
    mode: str,
    images: Sequence[str] = (),
    template: str | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """The messages for a chat API; for a text API one prompt in the endpoint's instruct template (a
    continued reply left open), with the template's stop strings added. ``template``: the person's
    own (A17), resolved by the caller; else the endpoint's built-in one."""
    # AI Horde (A48) takes one prompt, as a text API does.
    text = endpoint.api in ("text", "horde")
    markup = template if template is not None else endpoint.instruct_template
    stop = [*sampler["stop"], *(instruct_stops(markup) if text else [])]
    return {
        "model": endpoint.model,
        **(
            {"prompt": render_instruct(messages, markup, mode == "continue")}
            if text
            # The person's last line goes last (SystemOrder.py): some templates drop a trailing system message.
            else {"messages": with_images(systems_before_last_user(messages), images)}
        ),
        "stream": True,
        "temperature": sampler["temperature"],
        "top_p": sampler["top_p"],
        "top_k": sampler["top_k"],
        "repetition_penalty": sampler["repetition_penalty"],
        # A story turn sends none (uncapped); an API that requires one gets its top (NativeApis, horde).
        **({} if sampler.get("uncapped") else {"max_tokens": sampler["max_tokens"]}),
        **({"stop": stop} if stop else {}),
        # Sent only when set (A47): servers that do not take them never see them.
        **({"logit_bias": sampler["logit_bias"]} if sampler.get("logit_bias") else {}),
        **({"negative_prompt": sampler["negative_prompt"]} if (sampler.get("negative_prompt") or "").strip() else {}),
        **({"guidance_scale": sampler["guidance_scale"]} if sampler.get("guidance_scale") is not None else {}),
        # SillyTavern's further samplers (audit gap 2): only the ones set, only to APIs that take them.
        **sampler_params(sampler.get("samplers") or {}, endpoint.api or "chat"),
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


def pieces_of(payload: str) -> tuple[str, str]:
    """What one ``data:`` payload carries: (reasoning a model streams apart (A45), answer text)."""
    body = payload.strip()
    if not body or body == "[DONE]":
        return "", ""
    try:
        delta = json.loads(body)["choices"][0].get("delta") or {}
        # DeepSeek, llama.cpp and vLLM name it reasoning_content; OpenRouter, reasoning.
        reasoning = (
            delta.get("reasoning_content") if delta.get("reasoning_content") is not None else delta.get("reasoning")
        )
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        reasoning = None
    return (reasoning if isinstance(reasoning, str) else ""), (delta_of(payload) or "")


class ReasoningJoiner:
    """Folds reasoning a model streams apart (A45) into the text as the contract's first reasoning
    pair, so the reply is read, stored and split like any other reasoning (lib/completionStream.ts)."""

    def __init__(self) -> None:
        self.open, self.close = CONTRACT["reasoning"]["pairs"][0]
        self.inside = False

    def take(self, payload: str) -> str | None:
        reasoning, content = pieces_of(payload)
        out = ""
        if reasoning:
            if not self.inside:
                out += self.open
            self.inside = True
            out += reasoning
        if content:
            if self.inside:
                out += self.close
            self.inside = False
            out += content
        return out or None

    def end(self) -> str | None:
        if not self.inside:
            return None
        self.inside = False
        return str(self.close)


HORDE: dict[str, Any] = CONTRACT["horde"]


def horde_body(body: Mapping[str, Any]) -> dict[str, Any]:
    """AI Horde's text job (A48), from the body a text API would get (lib/generate.ts hordeBody)."""
    stop = body.get("stop")
    params: dict[str, Any] = {
        # Horde requires a length: a story turn's (uncapped) is the top of the range.
        "max_length": body.get("max_tokens") or int(SAMPLER_RANGES["max_tokens"][1]),
        "temperature": body.get("temperature"),
        "top_p": body.get("top_p"),
        "top_k": body.get("top_k"),
        "rep_pen": body.get("repetition_penalty"),
    }
    if isinstance(stop, list) and stop:
        params["stop_sequence"] = stop
    model = body.get("model")
    return {
        "prompt": body.get("prompt"),
        "params": params,
        "models": [model] if isinstance(model, str) and model else [],
    }


async def horde_text(endpoint: Any, key: str, body: Mapping[str, Any]) -> str:
    """AI Horde (A48): the job submitted, then polled until done; its text, or the framework's 502/504."""
    base = endpoint.base_url.rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "apikey": key or HORDE["anonymous_key"],
        "Client-Agent": HORDE["client_agent"],
    }
    deadline = time.monotonic() + HORDE["wait_ms"] / 1000
    try:
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS) as client:
            submitted = await client.post(base + HORDE["submit_path"], headers=headers, json=horde_body(body))
            if submitted.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail={"message": f"The model endpoint answered {submitted.status_code}", "code": "model_refused"},
                )
            job = submitted.json().get("id") if isinstance(submitted.json(), dict) else None
            if not isinstance(job, str):
                raise HTTPException(
                    status_code=502, detail={"message": "The Horde gave no job", "code": "model_refused"}
                )
            while time.monotonic() < deadline:
                await asyncio.sleep(HORDE["poll_ms"] / 1000)
                status = (await client.get(base + HORDE["status_path"] + job, headers=headers)).json()
                if status.get("faulted"):
                    raise HTTPException(
                        status_code=502, detail={"message": "The Horde could not write it", "code": "model_refused"}
                    )
                if status.get("done"):
                    generations = status.get("generations") or [{}]
                    text = generations[0].get("text") if isinstance(generations[0], dict) else None
                    return text if isinstance(text, str) else ""
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(
            status_code=502, detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"}
        ) from error
    raise HTTPException(status_code=504, detail={"message": "The Horde took too long", "code": "model_timeout"})


def by_person(turn: Mapping[str, Any], playing_id: str | None) -> bool:
    """Whether a line is the person's own: a user line, or, in a campaign, their seat's character line
    (the client saves a seated person's lines as the seat's; Zephyrex RPG's build37 run: no roll ever)."""
    return turn["role"] == "user" or (
        playing_id is not None and turn["role"] == "character" and turn.get("speaker_character_id") == playing_id
    )


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

    def _template_of(self, endpoint: Any) -> str | dict[str, Any]:
        """The endpoint's instruct markup: the person's own template (A17) when it names one that
        still exists, else its built-in one."""
        templates = self._manager(InstructTemplateManager)
        if getattr(endpoint, "custom_template_id", None):
            try:
                return template_fields(templates.get(id=endpoint.custom_template_id))
            except HTTPException:
                pass
        # Else the person's own template whose activation regex its model matches (audit gap 4).
        rows = templates.list()
        found = active_template(
            str(endpoint.model or ""),
            [{"id": row.id, "name": row.name, "activation_regex": row.activation_regex or ""} for row in rows],
        )
        if found is not None:
            return template_fields(next(row for row in rows if row.id == found["id"]))
        return str(endpoint.instruct_template)

    async def _memories(self, body: GenerateRequest) -> str:
        """The chat's older lines recalled by meaning (A19, Remembering.py), by the requester's model
        set to embed, and the replying character's other chats when it remembers across chats
        (AP8); nothing for the table GM, which reads only the recent table talk, and nothing for a
        request _inputs refuses."""
        if body.mode == "table" or body.leaf_id is None:
            return ""
        try:
            chat = self._manager(ChatManager).get(id=body.chat_id)
            messages = self._manager(ChatMessageManager).list(chat_id=chat.id)
        except HTTPException:
            return ""
        # The cast and the seat from the wiki, as _inputs reads them (the composed suite).
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        wanted = [*(chat.character_ids or []), *([playing_id] if playing_id is not None else [])]
        entities = persons_for(self.model_registry, str(self.requester.id), wiki, wanted)
        persona = seat_person(entities, playing_id)
        cast = {character["id"]: character for character in world_cast(entities, chat.character_ids or [])}
        if all(message.id != body.leaf_id for message in messages):
            return ""
        lines = story_lines(
            [
                {
                    "id": message.id,
                    "role": message.role,
                    "channel": message.channel,
                    "speaker_character_id": message.speaker_character_id,
                    "content": message.swipes[message.swipe_index] if message.swipe_index < len(message.swipes) else "",
                    "x_carded": bool(getattr(message, "x_carded", False)),
                    "hidden": bool(getattr(message, "hidden", False)),
                }
                for message in branch_to(messages, body.leaf_id)
            ],
            persona["name"] if persona is not None else DEFAULT_USER_NAME,
            {character_id: character["name"] for character_id, character in cast.items()},
        )
        # Narrating (A20), the GM speaks: no character's memory across chats applies.
        speaker = None if body.mode == "narrate" else cast.get(body.speaker_id or next(iter(cast), ""))
        text: str = await memories_for(
            self._manager(MemoryManager),
            self._manager(ModelEndpointManager).list(),
            chat.id,
            lines,
            None
            if speaker is None
            else {"id": speaker["id"], "name": speaker["name"], "extensions": speaker.get("extensions") or {}},
            lambda: self._manager(ChatManager).list(),
        )
        return text

    def _save_variables(self, chat_id: str, variables: Mapping[str, Mapping[str, str]] | None) -> None:
        """The chat's variables after a reply's macros set them (audit gap 1), written only when they
        changed (as lib/generate.ts's saveVariables)."""
        if variables is None:
            return
        chats = self._manager(ChatManager)
        if dict(variables["local"]) != dict(chats.get(id=chat_id).variables or {}):
            chats.update(chat_id, variables=dict(variables["local"]))

    def _frame_of(self, campaign_id: str | None) -> Any:
        """The campaign frame a chat names, as the prompt reads it; none for a wiki campaign (the
        composed suite) or a frame that's gone."""
        frame = frame_for(self._manager(CampaignFrameManager), campaign_id)
        if frame is not None:
            return frame_of(frame)
        # A vault scenario is framed in the wiki campaign itself (Zephyrex RPG, 2026-11-22): its framing.
        return frame_from_framing(campaign_framing(self.model_registry, str(self.requester.id), campaign_id))

    def _inputs(
        self, body: GenerateRequest, save_timers: bool = True, purpose: str = "reply", memories: str = ""
    ) -> tuple[Any, dict[str, Any], dict[str, Any], list[str], dict[str, Any]]:
        """Everything a reply needs, read as the requester sees it (lib/generate.ts, step for step)."""
        started = time.monotonic()
        try:
            chat = self._manager(ChatManager).get(id=body.chat_id)
        except HTTPException as error:
            raise HTTPException(
                status_code=404,
                detail={"message": "Request searched ChatModel and could not find the required record."},
            ) from error

        # The composed suite (docs/DESIGN.md): the chat's wiki campaign's world entities are read once,
        # through the wiki's abilities, for World Info, the cast and the seat. A chat's characters are
        # wiki persons; one the campaign doesn't hold is read by id, and one that can't be read drops out.
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, session_marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        wiki_campaign = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        wanted = [*(chat.character_ids or []), *([playing_id] if playing_id is not None else [])]
        entities = persons_for(self.model_registry, str(self.requester.id), wiki_campaign, wanted)
        cast = world_cast(entities, chat.character_ids or [])
        # Narrating (A20), the GM speaks, so no character is named as the speaker.
        # Translating reads no cast, so it needs no speaker.
        no_speaker = body.mode == "narrate" or (purpose == "translate" and not cast)
        speaker_id = "" if no_speaker else body.speaker_id or (cast[0]["id"] if cast else None)
        if speaker_id is None or (not no_speaker and all(character["id"] != speaker_id for character in cast)):
            raise HTTPException(
                status_code=422,
                detail={"message": "The speaker must be a character in the chat", "code": "validation_error"},
            )
        # GM secrets (E): a GM-only record reaches the GM's prompts and that person's own voice only.
        entities = world_known_to(entities, speaker_id, body.mode in ("narrate", "table"))
        cast = world_cast(entities, chat.character_ids or [])

        # Who the person speaks as: the wiki person the seat holds (the composed suite); no persona store.
        # The person they play leaves the cast the AI plays; replies read the current session.
        persona = seat_person(entities, playing_id)
        if playing_id is not None:
            kept = set(ai_cast([character["id"] for character in cast], playing_id))
            cast = [character for character in cast if character["id"] in kept]

        messages = self._manager(ChatMessageManager).list(chat_id=chat.id)
        if body.leaf_id is not None and all(message.id != body.leaf_id for message in messages):
            raise HTTPException(
                status_code=422,
                detail={"message": "The leaf must be a message in the chat", "code": "validation_error"},
            )
        full_path = branch_to(messages, body.leaf_id) if body.leaf_id is not None else []
        # The current session's lines only: earlier sessions reach the model as their summaries.
        path_ids = [message.id for message in full_path]
        path = full_path[session_start_index(path_ids, session_marks) :]
        story_so_far = "\n\n".join(
            part for part in ((chat.summary or "").strip(), sessions_summary(path_ids, session_marks)) if part
        )
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
                "hidden": bool(getattr(message, "hidden", False)),
            }
            for message in path
        ]

        # World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
        # What lore and the data bank scan: the story, less what the table X-carded (A25).
        story_texts = [
            turn["content"]
            for turn in history
            if turn["channel"] in PROMPT["story_channels"] and not turn["x_carded"] and not turn["hidden"]
        ]
        # World Info runs over the wiki (the composed suite): the chat's wiki campaign's entities and
        # its setting's canon, through the wiki's world_entities ability; no wiki campaign, no lore.
        entries = world_lore_entries(entities)
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
        lore = activate_lore(
            entries, story_texts, len(story_texts), speaker_name, timers.read(chat.id), settings, random.random
        )
        if save_timers:
            timers.save(chat.id, lore.state)

        sampler: dict[str, Any] = {**PRESET_DEFAULTS, "stop": [], "prompt_layout": []}
        if chat.preset_id:
            preset = self._manager(GenerationPresetManager).get(id=chat.preset_id)
            sampler = {
                key: getattr(preset, key)
                for key in (
                    *PRESET_DEFAULTS.keys(),
                    "stop",
                    "prompt_layout",
                    "logit_bias",
                    "negative_prompt",
                    "guidance_scale",
                    "samplers",
                )
            }

        # The model for this request's role (A27): a model serving the role; for replies the chat's
        # own choice comes first. Otherwise the chat's model, then the default, then any.
        role = purpose if purpose != "reply" else "gm" if body.mode in ("table", "narrate") else "story"
        endpoints = self._manager(ModelEndpointManager)
        # Search sources (A42) are endpoints too, but never a model.
        every = sorted(
            (row for row in endpoints.list() if row.api not in CONTRACT["search_apis"]), key=lambda row: row.name
        )
        serving = [row for row in every if role in (row.roles or [])]
        chosen = endpoints.get(id=chat.endpoint_id) if chat.endpoint_id else None
        if chosen is not None and chosen.api in CONTRACT["search_apis"]:
            chosen = None
        asked = None
        if body.endpoint_id:
            # AP4: one of the person's own models, asked for this turn; another person's is not found.
            try:
                asked = endpoints.get(id=body.endpoint_id)
            except HTTPException as error:
                raise HTTPException(
                    status_code=404,
                    detail={"message": "Request searched ModelEndpointModel and could not find the required record."},
                ) from error
            if asked.api in CONTRACT["search_apis"]:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": "Validation error",
                        "code": "validation_error",
                        "errors": [{"loc": ["endpoint_id"], "msg": "A search source is not a model"}],
                    },
                )
        endpoint = (
            asked
            or (chosen if role == "story" else None)
            or next((row for row in serving if row.is_default), None)
            or next(iter(serving), None)
            or chosen
            or next((row for row in every if row.is_default), None)
            or next(iter(every), None)
        )
        if endpoint is None:
            raise HTTPException(
                status_code=409, detail={"message": "Add a model endpoint first", "code": "no_model_endpoint"}
            )
        # Narrator sliders (NarratorStyle.py, the operator 2026-11-21): a story or GM turn with no model
        # of its own named takes the endpoint nearest the chat's sliders, and never one that may not
        # narrate (under 10b, not a narrator, or not adherent enough).
        style = dict(chat.narrator_style or {})
        if purpose == "reply" and role in ("story", "gm") and asked is None and not (role == "story" and chosen):
            rows = [
                {
                    "id": row.id,
                    "model": row.model,
                    "roles": list(row.roles or []),
                    "is_default": bool(row.is_default),
                    "traits": dict(getattr(row, "traits", None) or {}),
                }
                for row in every
            ]
            current = next(one for one in rows if one["id"] == endpoint.id)
            sliders = any(isinstance(style.get(slider), (int, float)) for slider in NARRATOR_STYLE["sliders"])
            if sliders or not may_narrate(traits_of(current)):
                picked = narrator_endpoint(rows, style, None)
                endpoint = next((row for row in every if row.id == picked), endpoint)
        tuning = style_tuning(style, chat.content_rating)

        template = self._template_of(endpoint)
        frame = self._frame_of(chat.campaign_id)
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
            story_so_far,
            [
                {
                    key: getattr(script, key)
                    for key in (
                        "find",
                        "replace",
                        "placements",
                        "display_only",
                        "prompt_only",
                        "min_depth",
                        "max_depth",
                        "enabled",
                    )
                }
                for script in self._manager(RegexScriptManager).list()
            ],
            next((objective["text"] for objective in (chat.objectives or []) if not objective["done"]), ""),
            self._data_bank(chat, story_texts, body.mode in ("narrate", "table")),
            {"content_rating": chat.content_rating, "lines": chat.lines or [], "veils": chat.veils or []},
            chat.table_notes or [],
            frame,
            scenario_of(self._manager(ScenarioManager).get(id=chat.scenario_id)) if chat.scenario_id else None,
            memories,
            macro_context(chat, path, cast, speaker_id, persona, endpoint.model),
            # A text API's own template may carry SillyTavern's context template (audit gap 4).
            template if isinstance(template, dict) and endpoint.api in ("text", "horde") else None,
            # A group's joined cards and own scenario (audit gap 6).
            chat.group_settings or {},
            # The chat's /inject injections (audit gap 5).
            chat.injections or [],
            forbid=body.forbid,
            # Grounded state (Dispositions.py): who is here and the stances this voice reads.
            scene=scene_state(
                [
                    *(
                        [
                            {
                                "id": playing_id,
                                "name": persona["name"],
                                "line": one_line(persona.get("description") or ""),
                            }
                        ]
                        if persona is not None and playing_id is not None
                        else []
                    ),
                    *[
                        {"id": character["id"], "name": character["name"], "line": one_line(character["description"])}
                        for character in cast
                    ],
                ],
                dict(chat.dispositions or {}),
                None if body.mode == "narrate" else speaker_id,
            ),
            # The sliders' lines: the narrator reads the length and the tone; a voice, the length.
            style=" ".join(
                line for line in [tuning["length"], *(tuning["tones"] if body.mode == "narrate" else [])] if line
            ),
            # Party members know each other (the operator, 2026-11-21): roster, relationships, briefing.
            party=party_text(
                party_of(entities, chat.character_ids or [], playing_id),
                None if body.mode == "narrate" else speaker_id,
                entities,
                party_briefing(entities),
            ),
        )
        if body.mode == "table":
            # The table GM (A11, A20) reads the table talk, with the story for reference only.
            assembled = table_gm_prompt(
                cast,
                persona,
                history,
                int(sampler["context_tokens"]),
                int(sampler["max_tokens"]),
                story_so_far,
                {"content_rating": chat.content_rating, "lines": chat.lines or [], "veils": chat.veils or []},
                chat.table_notes or [],
                frame,
            )
        if purpose == "reply":
            # Group stop strings (Group.py): a reply ends where it starts another speaker's line.
            stops = group_stops(
                body.mode,
                "" if body.mode == "impersonate" else speaker_name,
                [character["name"] for character in cast],
                persona["name"] if persona is not None else DEFAULT_USER_NAME,
                # The most recent speakers first, for the four stops there are.
                [
                    character["name"]
                    for turn in reversed(history)
                    if turn["role"] == "character"
                    for character in cast
                    if character["id"] == turn["speaker_character_id"]
                ],
            )
            sampler = {**sampler, "stop": list(dict.fromkeys([*sampler["stop"], *stops]))}
            # No token ceiling on a story turn (the operator, 2026-11-21: "Quit it with the response token
            # limits, it cuts shit off more than it helps"): length is the prompt's and the verbosity
            # slider's wording; complete_text guards a stream that truly ends mid-sentence. The narrator
            # sliders' humour warms the temperature (NarratorStyle.py).
            sampler = {
                **sampler,
                "uncapped": True,
                "temperature": float(sampler["temperature"]) + float(tuning["temperature_delta"]),
                # Against replays (the play-test: a round retold almost word for word): the preset's own win.
                "samplers": {**PROMPT["story_penalties"], **(sampler.get("samplers") or {})},
            }
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        # "Start reply with" (audit gap 3): a text API carries on from it, as from a reply being continued.
        # Anthropic's and Google's own APIs (audit gap 8) take no pictures yet.
        request = upstream_request(
            endpoint,
            key,
            upstream_body(
                endpoint,
                sampler,
                assembled.messages,
                "continue" if assembled.prefill else body.mode,
                () if endpoint.api in NATIVE_APIS else images,
                template,
            ),
        )
        context = {
            "chat": chat,
            "playing_id": playing_id,
            "speaker_id": speaker_id or None,
            "cast": cast,
            "persona": persona,
            "history": history,
            "endpoint": endpoint,
            "key": key,
            "template": template,
            # Where a background is set (the composed suite): the wiki location the story names last,
            # else the chat's own scenario.
            "place": background_place(entities, history, str((chat.group_settings or {}).get("scenario") or "")),
            # The wiki's world as this voice may know it, for decided turns' presence.
            "world": entities,
        }
        # Where a turn's seconds go (the operator, 2026-11-22: about two minutes before the first token).
        logger.info("inputs %s (%s): %.1fs", body.mode, purpose, time.monotonic() - started)
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
        # A preview: the lore timers do not move and no chat model is asked (a model set to embed may
        # be, to recall the chat's older lines, A19).
        assembled, _request, sampler, active, _context = self._inputs(
            body.generate, save_timers=False, memories=await self._memories(body.generate)
        )
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
        path="/gen",
        input_model=GenRequestEnvelope,
        output_model=GenEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="STscript's /gen and /genraw: the chat's model's answer to an instruction (audit gap 5)",
    )
    async def gen_route(self, body: GenRequestEnvelope) -> GenEnvelope:
        asked = body.gen
        assembled, _request, sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, speaker_id=asked.speaker_id),
            save_timers=False,
        )
        messages = gen_messages(
            [] if asked.raw else assembled.messages, asked.prompt, asked.raw, assembled.prefill or ""
        )
        return GenEnvelope(gen=GenAnswer(text=await self._ask(context, sampler, messages)))

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
        _assembled, _request, sampler, _active, context = self._inputs(
            body.generate, save_timers=False, purpose="summary"
        )
        asked = summary_prompt(
            context["cast"],
            context["persona"],
            context["history"],
            int(sampler["context_tokens"]),
            int(sampler["max_tokens"]),
        )
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
        _assembled, _request, sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id), save_timers=False, purpose="translate"
        )
        text = await self._ask(context, sampler, translate_prompt(asked.text, asked.language))
        return TranslateEnvelope(translate=TranslateRequest(chat_id=asked.chat_id, text=text, language=asked.language))

    @custom_route(
        method="POST",
        path="/status_line",
        input_model=StatusLineRequestEnvelope,
        output_model=StatusLineEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="The campaign's one spoiler-safe status line, rewritten by the summary model and kept",
    )
    async def status_line_route(self, body: StatusLineRequestEnvelope) -> StatusLineEnvelope:
        asked = body.status_line
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        _assembled, _request, sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id), save_timers=False, purpose="summary"
        )
        story = set(PROMPT["story_channels"])
        lines = [
            strip_markup(turn["content"])
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        # The same call keeps the stances (Dispositions.py): no extra model call.
        parsed = parse_status(await self._ask(context, sampler, status_messages(chat.summary or "", lines)))
        text = str(parsed["line"])
        if not text:
            raise HTTPException(status_code=502, detail={"message": "The model gave no line", "code": "model_refused"})
        people = [entity for entity in context["world"] if entity.get("kind") == "person"]
        dispositions = apply_stances(dict(chat.dispositions or {}), parsed["updates"], people)
        self._manager(ChatManager).update(chat.id, status_line=text, dispositions=dispositions)
        return StatusLineEnvelope(status_line=StatusLineText(text=text, stances=len(parsed["updates"])))

    def _data_bank(self, chat: Any, story: list[str], gm: bool) -> str:
        """The data bank's notes for this turn (A41), from the wiki (the composed suite, mapping item 4):
        the chat's wiki campaign's documents, through the wiki's campaign_documents ability."""
        wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        documents = campaign_documents(self.model_registry, str(self.requester.id), wiki)
        # The extension modules are imported by the framework at run time, so mypy sees them as Any.
        text: str = data_bank_text(wiki_document_texts(documents, gm), story)
        return text

    @custom_route(
        method="POST",
        path="/ping",
        input_model=PingRequestEnvelope,
        output_model=PingEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Whether a model's server answers, how quickly, and whether it offers the model (A28)",
    )
    async def ping_route(self, body: PingRequestEnvelope) -> PingEnvelope:
        # A check, not a request for work: a server that cannot be reached is ok=false, never an error.
        endpoint = self._manager(ModelEndpointManager).get(id=body.ping.endpoint_id)
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        started = time.monotonic()
        try:
            # Anthropic's and Google's own APIs (audit gap 8) list their models in their own shape.
            listing: dict[str, Any] = (
                native_models_request(endpoint.api, endpoint.base_url, key)
                if endpoint.api in NATIVE_APIS
                else {
                    "url": models_url(endpoint.base_url),
                    "headers": {"Authorization": f"Bearer {key}"} if key else {},
                }
            )
            url: str = listing["url"]
            headers: dict[str, str] = listing["headers"]
            async with httpx.AsyncClient(timeout=PING_TIMEOUT_SECONDS) as client:
                answer = await client.get(url, headers=headers)
        except httpx.HTTPError:
            latency = int((time.monotonic() - started) * 1000)
            return PingEnvelope(
                ping=Ping(
                    ok=False, latency_ms=latency, status=None, has_model=None, detail="The server could not be reached"
                )
            )
        latency = int((time.monotonic() - started) * 1000)
        try:
            answered: Any = answer.json()
        except ValueError:
            answered = None
        listed = answered.get("data") if isinstance(answered, dict) else None
        ids: list[str] | None
        if endpoint.api in NATIVE_APIS:
            ids = native_model_ids(endpoint.api, answered)
        elif isinstance(listed, list):
            ids = [str(model["id"]) for model in listed if isinstance(model, dict) and isinstance(model.get("id"), str)]
        else:
            ids = None
        ok = answer.status_code < 400
        detail = (
            ("Answered, without a model list" if ids is None else f"{len(ids)} models offered")
            if ok
            else f"Answered {answer.status_code}"
        )
        return PingEnvelope(
            ping=Ping(
                ok=ok,
                latency_ms=latency,
                status=answer.status_code,
                has_model=None if ids is None else endpoint.model in ids,
                detail=detail,
            )
        )

    @custom_route(
        method="POST",
        path="/expression",
        input_model=ExpressionRequestEnvelope,
        output_model=ExpressionEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Which of a character's sprites fits a line, chosen only from its own labels (A4)",
    )
    async def expression_route(self, body: ExpressionRequestEnvelope) -> ExpressionEnvelope:
        asked = body.expression
        labels = [row.label for row in self._manager(CharacterExpressionManager).list(character_id=asked.character_id)]
        if not labels:
            return ExpressionEnvelope(expression=Expression(label=None))
        # A decision model, when the person has one (the decide role), answers this as a choice among
        # the labels; without one, or when it gives no answer, the chat's own model is asked as before.
        deciding = self._decider()
        if deciding is not None:
            answers = await ask_decider(
                deciding.base_url,
                deciding.model,
                decrypt_secret(deciding.api_key) if deciding.api_key else "",
                split_reasoning(asked.text)[1],
                {
                    "expression": {
                        "type": "choice",
                        "instructions": "Which feeling fits how this line is said?",
                        "criteria": labels,
                    }
                },
                getattr(deciding, "extra_body", None),
            )
            decided = (answers or {}).get("expression")
            if decided is not None and "choice" in decided:
                return ExpressionEnvelope(expression=Expression(label=decided["choice"]))
        _assembled, _request, sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id), save_timers=False, purpose="summary"
        )
        try:
            answer = await self._ask(
                context, {**sampler, "max_tokens": 8}, expression_prompt(split_reasoning(asked.text)[1], labels)
            )
        except HTTPException:
            answer = ""
        return ExpressionEnvelope(expression=Expression(label=pick_option(answer, labels)))

    def _decider(self) -> Any:
        """The person's model serving the decide role (the default one first), or None."""
        rows = sorted(
            (row for row in self._manager(ModelEndpointManager).list() if "decide" in (row.roles or [])),
            key=lambda row: row.name,
        )
        return next((row for row in rows if row.is_default), rows[0] if rows else None)

    def _picture_prompt(self, asked: PictureRequest) -> str:
        """What the picture route asks the image model to draw, for each kind (the lite twin's picturePrompt)."""
        if asked.kind == "portrait":
            row = self._manager(CharacterManager).get(id=asked.character_id)
            portrait: str = portrait_picture_prompt(
                {"name": row.name, "description": row.description or ""}, asked.prompt
            )
            return portrait
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id or "", leaf_id=asked.leaf_id), save_timers=False
        )
        if asked.kind == "background":
            background: str = background_picture_prompt(
                context["cast"], context["persona"], context["history"], context["place"], asked.prompt
            )
            return background
        scene: str = scene_picture_prompt(context["cast"], context["persona"], context["history"], asked.prompt)
        return scene

    @custom_route(
        method="POST",
        path="/picture",
        input_model=PictureRequestEnvelope,
        output_model=PictureEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A picture of a scene, a portrait or a background, drawn by a model serving the image role (A30)",
    )
    async def picture_route(self, body: PictureRequestEnvelope) -> PictureEnvelope:
        prompt = self._picture_prompt(body.picture)
        return PictureEnvelope(picture=Picture(prompt=prompt, image=await self._draw(prompt)))

    def _drawing_endpoint(self) -> Any:
        """The model the person set to draw (the default one first), or None: a chat model never draws."""
        drawing = sorted(
            (row for row in self._manager(ModelEndpointManager).list() if "image" in (row.roles or [])),
            key=lambda row: row.name,
        )
        return next((row for row in drawing if row.is_default), None) or next(iter(drawing), None)

    async def _draw(self, prompt: str) -> str:
        """A picture of the prompt from the person's drawing model, as a data URL, or the framework's error."""
        endpoint = self._drawing_endpoint()
        if endpoint is None:
            raise HTTPException(
                status_code=409, detail={"message": "Set a model to draw pictures first", "code": "no_image_model"}
            )
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        try:
            async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS) as client:
                answer = await client.post(
                    images_url(endpoint.base_url),
                    headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
                    json=with_extra_body(
                        {
                            "model": endpoint.model,
                            "prompt": prompt,
                            "n": 1,
                            "size": getattr(endpoint, "image_size", "") or CONTRACT["picture"]["size"],
                            "response_format": "b64_json",
                        },
                        getattr(endpoint, "extra_body", None),
                    ),
                )
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502,
                detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"},
            ) from error
        if answer.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={"message": f"The model endpoint answered {answer.status_code}", "code": "model_refused"},
            )
        try:
            image = picture_of(answer.json())
        except ValueError:
            image = None
        if image is None or len(image) > LIMITS["avatar_bytes"]:
            raise HTTPException(
                status_code=502,
                detail={"message": "The model sent no picture this app can keep", "code": "model_refused"},
            )
        return image

    @custom_route(
        method="POST",
        path="/search",
        input_model=SearchRequestEnvelope,
        output_model=SearchEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="The install's search source asked a query, as a block a chat keeps for the model (A42)",
    )
    async def search_route(self, body: SearchRequestEnvelope) -> SearchEnvelope:
        query = body.search.query
        sources = sorted(
            (row for row in self._manager(ModelEndpointManager).list() if row.api in CONTRACT["search_apis"]),
            key=lambda row: row.name,
        )
        source = next((row for row in sources if row.is_default), None) or next(iter(sources), None)
        if source is None:
            raise HTTPException(
                status_code=409, detail={"message": "Set a search source first", "code": "no_search_source"}
            )
        key = decrypt_secret(source.api_key) if source.api_key else ""
        async with httpx.AsyncClient() as client:
            results = await web_search(client, {"kind": source.api, "base_url": source.base_url, "api_key": key}, query)
        return SearchEnvelope(
            search=SearchAnswer(
                query=query,
                results=[SearchResultItem(**result) for result in results],
                context=search_context(query, results),
            )
        )

    @custom_route(
        method="POST",
        path="/speech",
        input_model=SpeechRequestEnvelope,
        output_model=SpeechEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A line read aloud by a model serving the voice role (A29)",
    )
    async def speech_route(self, body: SpeechRequestEnvelope) -> SpeechEnvelope:
        asked = body.speech
        # Only a model the person set to speak: a chat model is never asked to.
        speaking = sorted(
            (row for row in self._manager(ModelEndpointManager).list() if "voice" in (row.roles or [])),
            key=lambda row: row.name,
        )
        endpoint = next((row for row in speaking if row.is_default), None) or next(iter(speaking), None)
        if endpoint is None:
            raise HTTPException(
                status_code=409, detail={"message": "Set a model to speak first", "code": "no_voice_model"}
            )
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        try:
            async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS) as client:
                answer = await client.post(
                    speech_url(endpoint.base_url),
                    headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
                    json=speech_body(endpoint.model, asked.text, asked.voice, asked.speed),
                )
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502,
                detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"},
            ) from error
        if answer.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={"message": f"The model endpoint answered {answer.status_code}", "code": "model_refused"},
            )
        media_type = audio_type(answer.headers.get("content-type"))
        if media_type is None or not answer.content or len(answer.content) > SPEECH["audio_bytes"]:
            raise HTTPException(
                status_code=502,
                detail={"message": "The model sent no speech this app can play", "code": "model_refused"},
            )
        return SpeechEnvelope(speech=Speech(audio=audio_data_url(media_type, answer.content)))

    @custom_route(
        method="POST",
        path="/move",
        input_model=MoveRequestEnvelope,
        output_model=MovedEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Move a message up: swap it with its parent, where the parent has no other reply (A9)",
    )
    async def move_route(self, body: MoveRequestEnvelope) -> MovedEnvelope:
        messages = self._manager(ChatMessageManager)
        try:
            message = messages.get(id=body.move.message_id)
        except HTTPException as error:
            raise HTTPException(
                status_code=404,
                detail={"message": "Request searched ChatMessageModel and could not find the required record."},
            ) from error
        if message.parent_id is None:
            raise HTTPException(
                status_code=422,
                detail={"message": "The first message has nothing above it", "code": "validation_error"},
            )
        parent = messages.get(id=message.parent_id)
        # Only along one branch: with other replies under the parent, a swap would reorder their branches too.
        replies = [one for one in messages.list(chat_id=message.chat_id) if one.parent_id == parent.id]
        if len(replies) != 1:
            raise HTTPException(
                status_code=422,
                detail={"message": "Its parent has other replies, so it can't move up", "code": "validation_error"},
            )
        upper = {field: getattr(parent, field) for field in MOVED_FIELDS}
        lower = {field: getattr(message, field) for field in MOVED_FIELDS}
        # The speaker and role change places too, which a client's update may not do: the framework's
        # trusted update, for server-side operations, validates against the whole model.
        messages.update_trusted(parent.id, **lower)
        messages.update_trusted(message.id, **upper)
        return MovedEnvelope(move=Moved(message_id=parent.id))

    @custom_route(
        method="POST",
        path="/next_turn",
        input_model=NextTurnRequestEnvelope,
        output_model=NextTurnEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Who speaks next, by the decision model: a character, the GM interjecting, or a pause for the person",
    )
    async def next_turn_route(self, body: NextTurnRequestEnvelope) -> NextTurnEnvelope:
        undecided = NextTurnEnvelope(next_turn=NextTurn(decided=False))
        deciding = self._decider()
        if deciding is None:
            return undecided
        asked = body.next_turn
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        persona = context["persona"]
        player = persona["name"] if persona is not None else DEFAULT_USER_NAME
        seat = turn_seat(chat.seat, playing_id is not None)
        names = {character["id"]: character["name"] for character in context["cast"]}
        story = set(PROMPT["story_channels"])
        story_turns = [
            turn
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        # Only those in the scene, or reached by vox, can be picked (the operator, 2026-11-21).
        world = context["world"]
        locations = [
            {**entity, "aliases": list(entity.get("aliases") or [])}
            for entity in world
            if entity.get("kind") == "location" and not entity.get("deleted")
        ]
        at = scene_location([{"text": turn["content"], "channel": "story"} for turn in story_turns], locations)
        presence = {
            "tokens": None,
            "scene_location": at,
            "location_parents": {location["id"]: location.get("parent_id") for location in locations},
            "person_locations": {
                entity["id"]: entity.get("location_id") for entity in world if entity.get("kind") == "person"
            },
            "recent": [
                {
                    "speaker_id": playing_id
                    if turn["role"] == "user"
                    else turn["speaker_character_id"]
                    if turn["role"] == "character"
                    else None,
                    "text": turn["content"],
                }
                for turn in story_turns
            ],
            "vox": chat.vox_ids or [],
        }
        reach = present_cast(context["cast"], presence)
        # After the person's own line someone answers: no pause.
        after_person = bool(story_turns) and by_person(story_turns[-1], playing_id)
        question, picks = turn_question(
            context["cast"],
            chat.muted_ids or [],
            playing_id,
            seat,
            player,
            [*reach["present"], *reach["vox"]],
            after_person,
        )
        place = next((location["name"] for location in locations if location["id"] == at), None)

        def named(ids: list[str]) -> list[str]:
            return [names[id_] for id_ in ids if names.get(id_)]

        state = turn_state(
            [
                {
                    "name": player
                    if turn["role"] == "user"
                    else names.get(turn["speaker_character_id"] or "", PROMPT["narrator_name"])
                    if turn["role"] == "character"
                    else CONTRACT["table"]["gm_name"],
                    "text": turn["content"],
                }
                for turn in story_turns
            ],
            {"place": place, "present": named(reach["present"]), "vox": named(reach["vox"])},
        )
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            state,
            {"next": question},
            getattr(deciding, "extra_body", None),
        )
        pick = turn_pick((answers or {}).get("next"), picks)
        if pick is None:
            return undecided
        return NextTurnEnvelope(next_turn=NextTurn(decided=True, kind=pick["kind"], character_id=pick.get("id")))

    @custom_route(
        method="POST",
        path="/needs_roll",
        input_model=NeedsRollRequestEnvelope,
        output_model=NeedsRollEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Whether a character's action needs a roll and which, from the system pack or the light dice",
    )
    async def needs_roll_route(self, body: NeedsRollRequestEnvelope) -> NeedsRollEnvelope:
        undecided = NeedsRollEnvelope(needs_roll=NeedsRoll(decided=False))
        deciding = self._decider()
        if deciding is None:
            return undecided
        asked = body.needs_roll
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        persona = context["persona"]
        player = persona["name"] if persona is not None else DEFAULT_USER_NAME
        names = {character["id"]: character["name"] for character in context["cast"]}
        actor = player if asked.character_id == playing_id else names.get(asked.character_id)
        if actor is None:
            raise HTTPException(
                status_code=422,
                detail={"message": "The character must be in the chat", "code": "validation_error"},
            )
        mode = "narrative"
        if chat.campaign_id:
            # A chat's campaign may be a wiki campaign with no frame of the person's: narrative then.
            frame = frame_for(self._manager(CampaignFrameManager), chat.campaign_id)
            mode = getattr(frame, "resolution_mode", None) or "narrative"
        story = set(PROMPT["story_channels"])
        # The actor's latest story line: an attempt at something uncertain always gets a test.
        acted = next(
            (
                turn
                for turn in reversed(context["history"])
                if turn["channel"] in story
                and (
                    by_person(turn, playing_id)
                    if asked.character_id == playing_id
                    else turn["speaker_character_id"] == asked.character_id
                )
            ),
            None,
        )
        # The play-test: a laugh about a fireplace got a roll. No attempt, no roll, and no model call.
        if acted is None or not is_attempt(acted["content"]):
            return NeedsRollEnvelope(needs_roll=NeedsRoll(decided=True, kind="none"))
        # The VTT's tests only once there is an attempt to test (a read per turn otherwise).
        options = await test_options(self.model_registry, str(self.requester.id), asked.character_id)
        questions, picks = roll_questions(options, mode, actor, True)
        # No system, no roll (the operator: mechanics are never a model's).
        if not questions:
            return NeedsRollEnvelope(needs_roll=NeedsRoll(decided=True, kind="none"))
        state = turn_state(
            [
                {
                    "name": player
                    if turn["role"] == "user"
                    else names.get(turn["speaker_character_id"] or "", PROMPT["narrator_name"])
                    if turn["role"] == "character"
                    else CONTRACT["table"]["gm_name"],
                    "text": turn["content"],
                }
                for turn in context["history"]
                if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
            ]
        )
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            state,
            questions,
            getattr(deciding, "extra_body", None),
        )
        pick = roll_pick(answers, picks, options)
        if pick is None:
            return undecided
        rolled = pick["kind"] != "none"
        return NeedsRollEnvelope(
            needs_roll=NeedsRoll(
                decided=True,
                kind=pick["kind"],
                person_id=asked.character_id if rolled else None,
                name=pick.get("name"),
                difficulty=pick.get("difficulty"),
                label=pick.get("label"),
                source=pick.get("source"),
            )
        )

    @custom_route(
        method="POST",
        path="/world_tick",
        input_model=WorldTickRequestEnvelope,
        output_model=WorldTickEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="In-world time passes: the wiki clock moves on and NPCs go where routine and motive take them",
    )
    async def world_tick_route(self, body: WorldTickRequestEnvelope) -> WorldTickEnvelope:
        asked = body.world_tick
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        if wiki is None:
            return WorldTickEnvelope(world_tick=WorldTick(skipped=True, reason="no wiki campaign"))
        requester = str(self.requester.id)
        reason = asked.reason.strip() or "time passes"
        clock = await advance_clock(self.model_registry, requester, wiki, asked.minutes, reason)
        if clock is None:
            return WorldTickEnvelope(world_tick=WorldTick(skipped=True, reason="only the GM moves the clock"))
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(requester, self.model_registry, chat.id)
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        world = context["world"]
        story = set(PROMPT["story_channels"])
        story_turns = [
            turn
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        locations = [
            {
                "id": entity["id"],
                "name": entity["name"],
                "parent_id": entity.get("parent_id"),
                "aliases": list(entity.get("aliases") or []),
            }
            for entity in world
            if entity.get("kind") == "location" and not entity.get("deleted")
        ]
        at = scene_location([{"text": turn["content"], "channel": "story"} for turn in story_turns], locations)
        reach = present_cast(
            context["cast"],
            {
                "tokens": None,
                "scene_location": at,
                "location_parents": {location["id"]: location["parent_id"] for location in locations},
                "person_locations": {
                    entity["id"]: entity.get("location_id") for entity in world if entity.get("kind") == "person"
                },
                "recent": [
                    {
                        "speaker_id": playing_id
                        if turn["role"] == "user"
                        else turn["speaker_character_id"]
                        if turn["role"] == "character"
                        else None,
                        "text": turn["content"],
                    }
                    for turn in story_turns
                ],
                "vox": chat.vox_ids or [],
            },
        )
        # The party travels with the person; those in the scene stay; the seat is the person's.
        still = [
            *reach["present"],
            *[one["id"] for one in party_of(world, chat.character_ids or [], playing_id)],
            *([playing_id] if playing_id is not None else []),
        ]
        persons = [
            {
                "id": entity["id"],
                "name": entity["name"],
                "location_id": entity.get("location_id"),
                "routine": entity.get("routine"),
                "motivations": entity.get("motivations"),
            }
            for entity in world
            if entity.get("kind") == "person" and not entity.get("deleted")
        ]
        questions, picks, fallbacks = tick_questions(persons, locations, clock, still)
        answers = None
        deciding = self._decider() if questions else None
        if deciding is not None:
            place = next((location["name"] for location in locations if location["id"] == at), None)
            answers = await ask_decider(
                deciding.base_url,
                deciding.model,
                decrypt_secret(deciding.api_key) if deciding.api_key else "",
                tick_state(clock, place),
                questions,
                getattr(deciding, "extra_body", None),
            )
        moves = [
            move
            for move in tick_moves(answers, picks, fallbacks, persons)
            if await move_person(self.model_registry, requester, str(move["person_id"]), str(move["to"]), reason)
        ]
        return WorldTickEnvelope(
            world_tick=WorldTick(skipped=False, now=clock, moves=moves, arrivals=arrivals(moves, at, locations))
        )

    @custom_route(
        method="POST",
        path="/clarify",
        input_model=ClarifyRequestEnvelope,
        output_model=ClarifyEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="The GM's question when the person's action leaves its target ambiguous among those present",
    )
    async def clarify_route(self, body: ClarifyRequestEnvelope) -> ClarifyEnvelope:
        none = ClarifyEnvelope(clarify=None)
        asked = body.clarify
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        if playing_id is None:
            return none
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        story = set(PROMPT["story_channels"])
        story_turns = [
            turn
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        if not story_turns or not by_person(story_turns[-1], playing_id):
            return none
        persona = context["persona"]
        actor = persona["name"] if persona is not None else DEFAULT_USER_NAME
        people = [*context["cast"], {"id": playing_id, "name": actor}]
        world = context["world"]
        locations = [
            {**entity, "aliases": list(entity.get("aliases") or [])}
            for entity in world
            if entity.get("kind") == "location" and not entity.get("deleted")
        ]
        at = scene_location([{"text": turn["content"], "channel": "story"} for turn in story_turns], locations)
        persons = [
            {"id": entity["id"], "name": entity["name"]}
            for entity in world
            if entity.get("kind") == "person" and not entity.get("deleted") and entity["id"] != playing_id
        ]
        reach = present_cast(
            persons,
            {
                "tokens": None,
                "scene_location": at,
                "location_parents": {location["id"]: location.get("parent_id") for location in locations},
                "person_locations": {
                    entity["id"]: entity.get("location_id") for entity in world if entity.get("kind") == "person"
                },
                "recent": [
                    {
                        "speaker_id": playing_id
                        if turn["role"] == "user"
                        else turn["speaker_character_id"]
                        if turn["role"] == "character"
                        else None,
                        "text": turn["content"],
                    }
                    for turn in story_turns
                ],
                "vox": chat.vox_ids or [],
            },
        )
        candidates = [person for person in persons if person["id"] in reach["present"]]
        need = clarify_need(parse_player_lines(story_turns[-1]["content"], people), playing_id, candidates)
        deciding = self._decider() if need is not None else None
        if need is None or deciding is None:
            return none
        questions = clarify_questions(need["action"], actor, candidates)
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            "\n".join(turn["content"] for turn in story_turns[-6:]),
            {"ambiguous": questions["decide"]},
            getattr(deciding, "extra_body", None),
        )
        return ClarifyEnvelope(clarify=questions["player"]) if should_ask((answers or {}).get("ambiguous")) else none

    @custom_route(
        method="POST",
        path="/map_step",
        input_model=MapStepRequestEnvelope,
        output_model=MapStepEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="The map follows the story: whoever the latest round moved goes to a real place the GM picks",
    )
    async def map_step_route(self, body: MapStepRequestEnvelope) -> MapStepEnvelope:
        asked = body.map_step
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        requester = str(self.requester.id)
        playing_id, _marks = play_context(requester, self.model_registry, chat.id)
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        story = set(PROMPT["story_channels"])
        story_turns = [
            turn
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        # The latest round: from the person's last line on.
        users = [index for index, turn in enumerate(story_turns) if by_person(turn, playing_id)]
        round_turns = story_turns[users[-1] :] if users else story_turns
        persona = context["persona"]
        actor = persona["name"] if persona is not None else DEFAULT_USER_NAME
        people = [*context["cast"], *([{"id": playing_id, "name": actor}] if playing_id is not None else [])]
        world = context["world"]
        locations = [
            {
                "id": entity["id"],
                "name": entity["name"],
                "parent_id": entity.get("parent_id"),
                "aliases": list(entity.get("aliases") or []),
            }
            for entity in world
            if entity.get("kind") == "location" and not entity.get("deleted")
        ]
        persons = [
            {"id": entity["id"], "name": entity["name"], "location_id": entity.get("location_id")}
            for entity in world
            if entity.get("kind") == "person" and not entity.get("deleted")
        ]

        def answer(moves: list[dict[str, Any]], reason: str | None) -> MapStepEnvelope:
            # The banner's place is server truth (the operator, 2026-11-21), on every answer.
            place = seat_place(playing_id, persons, locations, moves)
            return MapStepEnvelope(map_step=MapStep(skipped=reason is not None, reason=reason, moves=moves, **place))

        moving = movers([item for turn in round_turns for item in parse_player_lines(turn["content"], people)])
        if not moving:
            return answer([], "nobody moved")
        questions, picks, fallbacks = map_questions(moving, persons, locations)
        if not questions:
            return answer([], "nowhere to go")
        deciding = self._decider()
        if deciding is None:
            return answer([], "no decision model")
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            "\n".join(turn["content"] for turn in round_turns),
            questions,
            getattr(deciding, "extra_body", None),
        )
        names = {location["id"]: location["name"] for location in locations}
        moves = [
            {**move, "to_name": names.get(str(move["to"]), move["to"])}
            for move in tick_moves(answers, picks, fallbacks, persons)
            if await move_person(self.model_registry, requester, str(move["person_id"]), str(move["to"]), "the story")
        ]
        return answer(moves, None)

    @custom_route(
        method="POST",
        path="/npc_needed",
        input_model=NpcNeededRequestEnvelope,
        output_model=NpcNeededEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Whether the person's latest line meets someone who isn't a person yet, to author first",
    )
    async def npc_needed_route(self, body: NpcNeededRequestEnvelope) -> NpcNeededEnvelope:
        def answer(needed: bool, reason: str, figure: Mapping[str, str] | None = None) -> NpcNeededEnvelope:
            return NpcNeededEnvelope(
                npc_needed=NpcNeeded(
                    needed=needed,
                    name=figure["name"] if figure else None,
                    role=figure["role"] if figure else None,
                    reason=reason,
                )
            )

        asked = body.npc_needed
        chat = self._manager(ChatManager).get(id=asked.chat_id)
        from zephyrex.extensions.ai_chat.BLL_AI_Session import (  # type: ignore[import-not-found,unused-ignore]
            play_context,
        )

        playing_id, _marks = play_context(str(self.requester.id), self.model_registry, chat.id)
        _assembled, _request, _sampler, _active, context = self._inputs(
            GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"), save_timers=False
        )
        story = set(PROMPT["story_channels"])
        story_turns = [
            turn
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        latest = next((turn for turn in reversed(story_turns) if by_person(turn, playing_id)), None)
        if latest is None:
            return answer(False, "no line of the person's")
        persona = context["persona"]
        actor = persona["name"] if persona is not None else DEFAULT_USER_NAME
        known = [
            *context["cast"],
            *([{"id": playing_id, "name": actor}] if playing_id is not None else []),
            *(
                {"id": entity["id"], "name": entity["name"]}
                for entity in context["world"]
                if entity.get("kind") == "person" and not entity.get("deleted")
            ),
        ]
        # Free: a line that meets no one new asks no model.
        figures = npc_figures(str(latest["content"]), known)
        if not figures:
            return answer(False, "everyone the line meets is known")
        deciding = self._decider()
        if deciding is None:
            return answer(False, "no decision model")
        present = ", ".join(str(one["name"]) for one in context["cast"]) or "no one"
        question = {
            "type": "choice",
            "instructions": str(NPC_AUTHOR["question"]).replace("{{actor}}", actor).replace("{{present}}", present),
            "criteria": [figure["phrase"] for figure in figures] + [str(NPC_AUTHOR["none"])],
        }
        answers = await ask_decider(
            deciding.base_url,
            deciding.model,
            decrypt_secret(deciding.api_key) if deciding.api_key else "",
            "\n".join(str(turn["content"]) for turn in story_turns[-6:]),
            {"npc": question},
            getattr(deciding, "extra_body", None),
        )
        picked = ((answers or {}).get("npc") or {}).get("choice")
        figure = next((one for one in figures if one["phrase"] == picked), None)
        if figure is None:
            return answer(False, "the decision model chose no one new")
        return answer(True, f"{actor}'s line meets {figure['phrase']}", figure)

    @custom_route(
        method="POST",
        path="/author_npc",
        input_model=AuthorNpcRequestEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        response_class=StreamingResponse,
        openapi_tags=("AI Chat",),
        summary="Author a new NPC the story needs: written, made a person of the campaign, a sheet, a portrait",
    )
    async def author_npc_route(self, body: AuthorNpcRequestEnvelope) -> StreamingResponse:
        asked = body.author_npc
        chats = self._manager(ChatManager)
        chat = chats.get(id=asked.chat_id)
        name, role = asked.name.strip(), asked.role.strip() or asked.name.strip()
        drawing = self._drawing_endpoint() is not None
        total = 4 if drawing else 3
        steps = NPC_AUTHOR["steps"]

        def step(index: int, label: str) -> str:
            return frame("step", {"label": label, "done": index, "total": total})

        async def authored() -> AsyncIterator[str]:
            requester = str(self.requester.id)
            yield step(0, str(steps["write"]).replace("{{name}}", name))
            # 1. Written by the summary model from the campaign's framing and the scene.
            _assembled, _request, sampler, _active, context = await asyncio.to_thread(
                self._inputs,
                GenerateRequest(chat_id=asked.chat_id, leaf_id=asked.leaf_id, mode="narrate"),
                False,
                "summary",
            )
            story = set(PROMPT["story_channels"])
            scene = "\n".join(
                str(turn["content"]) for turn in context["history"] if turn["channel"] in story and not turn["hidden"]
            )[-4000:]
            framed = frame_text(self._frame_of(chat.campaign_id))
            instruction = str(NPC_AUTHOR["author_prompt"]).replace("{{name}}", name).replace("{{role}}", role)
            messages = [
                {"role": "system", "content": "\n\n".join(part for part in (framed, instruction) if part)},
                {"role": "user", "content": scene or "(The story begins.)"},
            ]
            try:
                fields = npc_writing(await self._ask(context, sampler, messages))
            except HTTPException:
                fields = npc_writing("")
            summary = fields["summary"] or role
            yield step(1, str(steps["person"]))
            # 2. A GM-only person of the campaign, joined to the chat's cast.
            wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
            person = await ensure_person(self.model_registry, requester, wiki, name, summary) if wiki else None
            if person is None:
                yield frame("error", {"detail": "The wiki can't make this person here"})
                return
            person_id = str(person["id"])
            cast = list(chats.get(id=chat.id).character_ids or [])
            if person_id not in cast:
                chats.update(chat.id, character_ids=[*cast, person_id])
            filled = {"summary": summary, "entry": npc_entry(fields)}
            filled |= {key: fields[key] for key in ("personality", "motive", "voice") if fields[key]}
            await update_person(self.model_registry, requester, person_id, {k: v for k, v in filled.items() if v})
            yield step(2, str(steps["sheet"]))
            # 3. Their sheet from the VTT's compendium for the campaign's system: never a model's numbers.
            await npc_sheet(self.model_registry, requester, person_id, role, summary)
            if drawing:
                yield step(3, str(steps["picture"]))
                # 4. A portrait, stored as an asset and set as their picture.
                try:
                    portrait = portrait_picture_prompt({"name": name, "description": fields["description"]})
                    image = await self._draw(portrait)
                    asset_id = await store_picture(self.model_registry, requester, name, image)
                    if asset_id is not None:
                        await update_person(self.model_registry, requester, person_id, {"picture": asset_id})
                except HTTPException:
                    pass
            yield step(total, str(steps["picture"] if drawing else steps["sheet"]))
            yield frame("done", {"person_id": person_id, "name": name})

        async def safe() -> AsyncIterator[str]:
            try:
                async for piece in heartbeat_iter(authored(), HEARTBEAT_SECONDS):
                    yield piece
            except HTTPException as error:
                detail = error.detail.get("message") if isinstance(error.detail, dict) else str(error.detail)
                yield frame("error", {"detail": detail or "The NPC could not be authored"})

        return event_stream(safe())

    @custom_route(
        method="POST",
        path="/ensure_person",
        input_model=EnsurePersonRequestEnvelope,
        output_model=EnsurePersonEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="Someone the narrator voiced, made a GM-only wiki person and added to the chat's cast",
    )
    async def ensure_person_route(self, body: EnsurePersonRequestEnvelope) -> EnsurePersonEnvelope:
        asked = body.ensure_person
        chats = self._manager(ChatManager)
        chat = chats.get(id=asked.chat_id)
        wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        requester = str(self.requester.id)
        name, line = asked.name.strip(), asked.line.strip()
        person = await ensure_person(self.model_registry, requester, wiki, name, line) if wiki is not None else None
        if person is None:
            raise HTTPException(
                status_code=409,
                detail={"message": "The wiki can't make this person here", "code": "no_wiki_person"},
            )
        cast = list(chat.character_ids or [])
        if person["id"] not in cast:
            chats.update(chat.id, character_ids=[*cast, str(person["id"])])
        return EnsurePersonEnvelope(
            ensure_person=EnsuredPerson(
                id=str(person["id"]), name=str(person.get("name") or asked.name), created=bool(person.get("created"))
            )
        )

    @custom_route(
        method="POST",
        path="/cut",
        input_model=CutRequestEnvelope,
        output_model=CutEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="STscript's /cut: the messages named leave the chat, their replies moving up to their parents",
    )
    async def cut_route(self, body: CutRequestEnvelope) -> CutEnvelope:
        messages = self._manager(ChatMessageManager)
        ids = list(dict.fromkeys(body.cut.message_ids))
        try:
            found = [messages.get(id=id_) for id_ in ids]
        except HTTPException as error:
            raise HTTPException(
                status_code=404,
                detail={"message": "Request searched ChatMessageModel and could not find the required record."},
            ) from error
        if len({message.chat_id for message in found}) != 1:
            raise HTTPException(
                status_code=422,
                detail={"message": "The messages cut must all be in one chat", "code": "validation_error"},
            )
        # One at a time, reading each one's parent as it now is: a cut line under another cut line
        # hands its replies on to the nearest line kept (lib/moveMessage.ts cut, the same way).
        for id_ in ids:
            message = messages.get(id=id_)
            for reply in messages.list(chat_id=message.chat_id):
                if reply.parent_id == id_:
                    messages.update_trusted(reply.id, parent_id=message.parent_id)
            messages.delete_one(id_)
        return CutEnvelope(cut=CutRequest(message_ids=ids))

    async def _ask(self, context: dict[str, Any], sampler: dict[str, Any], messages: list[dict[str, str]]) -> str:
        """The chat's model's whole answer to ``messages`` (read from its stream), or the framework's 502."""
        endpoint, key = context["endpoint"], context["key"]
        if endpoint.api == "horde":
            return (
                await horde_text(
                    endpoint, key, upstream_body(endpoint, sampler, messages, "reply", template=context.get("template"))
                )
            ).strip()
        request = upstream_request(
            endpoint, key, upstream_body(endpoint, sampler, messages, "reply", template=context.get("template"))
        )
        pieces: list[str] = []
        joiner = ReasoningJoiner()
        try:
            async with (
                httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS) as client,
                client.stream("POST", request["url"], headers=request["headers"], json=request["json"]) as upstream,
            ):
                if upstream.status_code >= 400:
                    raise HTTPException(
                        status_code=502,
                        detail={
                            "message": f"The model endpoint answered {upstream.status_code}",
                            "code": "model_refused",
                        },
                    )
                async for line in upstream.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = as_openai_payload(endpoint.api, line[len("data:") :])
                    if payload is None:
                        continue
                    if payload.strip() == "[DONE]":
                        break
                    delta = joiner.take(payload)
                    if delta is not None:
                        pieces.append(delta)
                closing = joiner.end()
                if closing is not None:
                    pieces.append(closing)
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=502,
                detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"},
            ) from error
        return "".join(pieces).strip()

    async def _save_structured(
        self,
        asked: GenerateRequest,
        context: dict[str, Any],
        items: ItemStream,
        people: list[dict[str, str]],
        seat_name: str,
        latest: str = "",
        outcome: dict[str, bool] | None = None,
    ) -> AsyncIterator[str]:
        """A structured turn saved, one message per speaker run: someone unnamed becomes a person of the
        campaign first (ensure_person; the operator, 2026-11-21), then the person and saved frames."""
        # Nothing retold (the operator, 2026-11-22: "Lots of repetition"): a replayed item is dropped.
        story = set(PROMPT["story_channels"])
        earlier = [
            str(turn["content"])
            for turn in context["history"]
            if turn["channel"] in story and not turn["x_carded"] and not turn["hidden"]
        ]
        within = partial_items(items.text)[: int(VOICE_GUARD["runaway"]["max_items"])]
        result = structured_runs(fresh_items(within, earlier), people, seat_name, latest)
        if asked.mode != "narrate":
            # A voice writes for itself alone (the operator: no character writes for the others).
            result = {**result, "runs": [run for run in result["runs"] if run["speaker_id"] == context["speaker_id"]]}
        if not result["runs"]:
            return
        chat = context["chat"]
        chats = self._manager(ChatManager)
        messages = self._manager(ChatMessageManager)
        requester = str(self.requester.id)
        wiki = wiki_campaign_for(self._manager(CampaignFrameManager), chat.campaign_id)
        known = list(people)
        cast = list(chat.character_ids or [])
        made: dict[str, str] = {}
        parent = asked.leaf_id
        saved: list[dict[str, Any]] = []
        for found in result["runs"]:
            run = found
            name = run["speaker_name"]
            if name is not None:
                if name.lower() not in made and wiki is not None:
                    line = str(run["lines"][0]["text"])
                    person = await ensure_person(self.model_registry, requester, wiki, name, line)
                    if person is not None:
                        made[name.lower()] = str(person["id"])
                        known.append({"id": str(person["id"]), "name": name})
                        if str(person["id"]) not in cast:
                            cast = [*cast, str(person["id"])]
                            chats.update(chat.id, character_ids=cast)
                        yield frame("person", {"name": name, "id": str(person["id"])})
                if name.lower() in made:
                    run = {**run, "speaker_id": made[name.lower()], "speaker_name": None}
            if run["speaker_id"] is not None and run["speaker_id"] not in cast:
                # Whoever speaks is in the chat before their line is saved (a message's speaker must be).
                cast = [*cast, str(run["speaker_id"])]
                chats.update(chat.id, character_ids=cast)
            text = plain_dashes(run_text(run, known))
            created = messages.create(
                chat_id=chat.id,
                parent_id=parent,
                role="narrator" if run["speaker_id"] is None else "character",
                channel="ic",
                speaker_character_id=run["speaker_id"],
                swipes=[text],
            )
            parent = str(created.id)
            saved.append(
                {
                    "id": parent,
                    "role": "narrator" if run["speaker_id"] is None else "character",
                    "speaker_character_id": run["speaker_id"],
                    "text": text,
                }
            )
        if outcome is not None:
            outcome["saved"] = True
        yield frame("saved", {"messages": saved})

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
                raise HTTPException(
                    status_code=409, detail={"message": "The table has paused the game", "code": "paused"}
                )

        # The prompt's build (memories, then the world and the lore) runs as a task: one done within
        # FIRST_ANSWER_SECONDS is answered as before; a slower one opens the stream at once with heartbeats,
        # so no proxy times out on it (build37's 504 on a character's reply).
        async def prepare() -> Any:
            memories = await self._memories(body.generate)
            return await asyncio.to_thread(self._inputs, body.generate, True, "reply", memories)

        preparing = asyncio.ensure_future(prepare())
        await asyncio.wait({preparing}, timeout=FIRST_ANSWER_SECONDS)
        if preparing.done():
            return await self._reply(body, preparing.result())

        async def late() -> AsyncIterator[str]:
            yield HEARTBEAT
            prepared: Any = None
            try:
                async for got in heartbeat_wait(preparing, HEARTBEAT_SECONDS):
                    if got is None:
                        yield HEARTBEAT
                    else:
                        prepared = got
                response = await self._reply(body, prepared)
            except HTTPException as error:
                detail = error.detail.get("message") if isinstance(error.detail, dict) else str(error.detail)
                yield frame("error", {"detail": detail or "The reply failed"})
                return
            async for chunk in response.body_iterator:
                yield chunk if isinstance(chunk, str) else bytes(chunk).decode()

        return event_stream(late())

    async def _reply(self, body: GenerateEnvelope, prepared: Any) -> StreamingResponse:
        """The reply's stream from its prepared inputs (generate_route)."""
        assembled, request, _sampler, _active, _context = prepared
        self._save_variables(body.generate.chat_id, assembled.variables)
        if _context["endpoint"].api == "horde":
            # AI Horde (A48): asked as a job, then answered as one text completion would be.
            text = await horde_text(_context["endpoint"], _context["key"], request["json"])

            async def answered() -> AsyncIterator[str]:
                if assembled.prefill:
                    yield frame("delta", {"text": assembled.prefill})
                joiner = ReasoningJoiner()
                delta = joiner.take(json.dumps({"choices": [{"text": text}]}))
                if delta is not None:
                    yield frame("delta", {"text": delta})
                closing = joiner.end()
                if closing is not None:
                    yield frame("delta", {"text": closing})
                yield frame("done", {"dropped": assembled.dropped})

            return event_stream(answered())
        structured = (
            body.generate.structured
            and body.generate.mode in STRUCTURED_MODES
            and not assembled.prefill
            and _context["endpoint"].api not in ("text", *NATIVE_APIS)
        )
        if structured:
            request = {**request, "json": structured_request(request["json"], _context)}
        client = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_SECONDS)

        def asked(body_json: dict[str, Any]) -> Any:
            return client.send(
                client.build_request("POST", request["url"], headers=request["headers"], json=body_json), stream=True
            )

        # A model that answers (or refuses) at once is read as before; one still loading gets a stream of
        # heartbeats until it answers, so no proxy times out on a silent wait (build33's 504).
        pending = asyncio.ensure_future(asked(request["json"]))
        await asyncio.wait({pending}, timeout=FIRST_ANSWER_SECONDS)
        if pending.done():
            try:
                first = pending.result()
            except httpx.HTTPError as error:
                await client.aclose()
                raise HTTPException(
                    status_code=502,
                    detail={"message": "The model endpoint could not be reached", "code": "model_unreachable"},
                ) from error
            if first.status_code >= 400:
                await first.aclose()
                await client.aclose()
                raise HTTPException(
                    status_code=502,
                    detail={"message": f"The model endpoint answered {first.status_code}", "code": "model_refused"},
                )

        seat_name = (
            str(_context["persona"]["name"])
            if _context["persona"] is not None and _context["playing_id"] is not None
            else ""
        )
        people = [{"id": str(one["id"]), "name": str(one["name"])} for one in _context["cast"]]
        story_channels = set(PROMPT["story_channels"])
        # The person's latest line: a structured beat that only echoes it is no answer (Structured.py).
        latest = next(
            (
                str(turn["content"])
                for turn in reversed(_context["history"])
                if by_person(turn, _context["playing_id"]) and turn["channel"] in story_channels
            ),
            "",
        )

        async def answer(upstream: Any, items: ItemStream | None) -> AsyncIterator[str]:
            """One pass over the model's stream: deltas or item events, heartbeats in any pause, stopped
            at the seat's item or a runaway."""
            told = ""
            stopped = False
            ended = 0

            def prose(delta: str) -> list[str]:
                """A piece of prose as a delta, stopped at the blank line after the runaway paragraph limit
                (VoiceGuard.py paragraph_cut): a structural stop, never mid-sentence."""
                nonlocal told, stopped
                combined = told + delta
                cut = paragraph_cut(combined)
                piece = delta if cut < 0 else combined[len(told) : max(cut, len(told))]
                stopped = cut >= 0
                told += piece
                return [frame("delta", {"text": piece})] if piece else []

            def shown(delta: str) -> list[str]:
                """The frames for one piece of the answer: item events, or a delta where it isn't structured."""
                nonlocal stopped, ended
                if items is None:
                    return prose(delta)
                was = items.mode
                events = items.feed(delta)
                if items.mode == "text":
                    # Prose after all: everything so far goes as deltas, the client's text path.
                    return prose(items.text if was == "unknown" else delta)
                ended += sum(1 for event in events if event["type"] == "item_end")
                stopped = ended >= int(VOICE_GUARD["runaway"]["max_items"])
                # An item's start is flat, as the client reads it (replyStream.ts): {index, kind, speaker, …}.
                return [
                    frame(
                        event["type"],
                        event["item"]
                        if event["type"] == "item_start"
                        else {key: value for key, value in event.items() if key != "type"},
                    )
                    for event in events
                ]

            joiner = ReasoningJoiner()
            async for line in heartbeat_lines(upstream, HEARTBEAT_SECONDS):
                if line is None:
                    yield HEARTBEAT
                    continue
                if not line.startswith("data:"):
                    continue
                payload = as_openai_payload(_context["endpoint"].api, line[len("data:") :])
                if payload is None:
                    continue
                if payload.strip() == "[DONE]":
                    break
                delta = joiner.take(payload)
                if delta is not None:
                    for piece in shown(delta):
                        yield piece
                if (items is not None and items.cut) or stopped:
                    # The seat's turn, or a runaway: nothing after it is kept.
                    break
            closing = joiner.end()
            if closing is not None and not stopped:
                for piece in shown(closing):
                    yield piece

        async def events() -> AsyncIterator[str]:
            # The reply begins with its prefill, so what's kept is the whole reply.
            if assembled.prefill:
                yield frame("delta", {"text": assembled.prefill})
            upstream: Any = None
            try:
                if not pending.done():
                    yield HEARTBEAT
                async for got in heartbeat_wait(pending, HEARTBEAT_SECONDS):
                    if got is None:
                        yield HEARTBEAT
                    else:
                        upstream = got
                if upstream.status_code >= 400:
                    yield frame("error", {"detail": f"The model endpoint answered {upstream.status_code}"})
                    return
                items = ItemStream(people, seat_name) if structured else None
                async for piece in answer(upstream, items):
                    yield piece
                if items is not None and items.mode == "json":
                    outcome = {"saved": False}
                    async for piece in self._save_structured(
                        body.generate, _context, items, people, seat_name, latest, outcome
                    ):
                        yield piece
                    if not outcome["saved"]:
                        # Nothing kept (an echo of the person's line, or the seat acted): asked once more.
                        await upstream.aclose()
                        upstream = None
                        again = asyncio.ensure_future(asked(structured_retry(request["json"], seat_name)))
                        async for got in heartbeat_wait(again, HEARTBEAT_SECONDS):
                            if got is None:
                                yield HEARTBEAT
                            else:
                                upstream = got
                        if upstream.status_code < 400:
                            retried = ItemStream(people, seat_name)
                            async for piece in answer(upstream, retried):
                                yield piece
                            if retried.mode == "json":
                                async for piece in self._save_structured(
                                    body.generate, _context, retried, people, seat_name, latest, outcome
                                ):
                                    yield piece
                yield frame("done", {"dropped": assembled.dropped})
            except httpx.HTTPError:
                yield frame("error", {"detail": "The model stopped mid-reply"})
            finally:
                if not pending.done():
                    pending.cancel()
                if upstream is not None:
                    await upstream.aclose()
                await client.aclose()

        return event_stream(events())
