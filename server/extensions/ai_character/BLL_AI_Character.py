# SPDX-License-Identifier: AGPL-3.0-or-later
"""Character cards and personas, on the framework's records (CRUD routes, ETag/If-Match on every
write): the same resources, fields and rules as the lite edition's (client/src/lib/rpgRecords.ts).

- ``/v1/character``: a character card's SillyTavern V2/V3 fields, its picture as a data URL, a
  favourite flag and the card's extensions object.
- ``/v1/persona``: who the person plays as. Making one the default clears the others.
"""

import json
import re
from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from pydantic import Field, field_validator

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import LIMITS  # type: ignore[import-not-found]
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

MAX_NAME: int = LIMITS["name_characters"]
MAX_CARD: int = LIMITS["card_field_characters"]
MAX_SHORT: int = LIMITS["short_text_characters"]
MAX_GREETINGS: int = LIMITS["greetings_per_character"]
MAX_TAGS: int = LIMITS["tags_per_record"]
MAX_TAG: int = LIMITS["tag_characters"]
MAX_AVATAR: int = LIMITS["avatar_bytes"]
MAX_EXTENSIONS: int = LIMITS["extensions_bytes"]
MAX_PERSONA: int = LIMITS["persona_description_characters"]
DATA_URL = re.compile(r"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$")


def _greetings(greetings: Any) -> Any:
    if greetings is None:
        return None
    if len(greetings) > MAX_GREETINGS:
        raise ValueError(f"A character has at most {MAX_GREETINGS} alternate greetings")
    if any(not isinstance(greeting, str) or len(greeting) > MAX_CARD for greeting in greetings):
        raise ValueError(f"A greeting is text of at most {MAX_CARD} characters")
    return greetings


def _tags(tags: Any) -> Any:
    if tags is None:
        return None
    cleaned = [tag.strip() for tag in tags if isinstance(tag, str)]
    if len(cleaned) != len(tags) or any(not tag or len(tag) > MAX_TAG for tag in cleaned):
        raise ValueError(f"A tag is text of 1 to {MAX_TAG} characters")
    if len(cleaned) > MAX_TAGS:
        raise ValueError(f"At most {MAX_TAGS} tags")
    return cleaned


def _avatar(avatar: Any) -> Any:
    if avatar is not None and (len(avatar) > MAX_AVATAR or not DATA_URL.match(avatar)):
        raise ValueError("An avatar is a PNG, JPEG, WebP or GIF data URL")
    return avatar


def _extensions(extensions: Any) -> Any:
    if extensions is not None and len(json.dumps(extensions)) > MAX_EXTENSIONS:
        raise ValueError("Extensions are too large")
    return extensions


def _name(name: Any) -> Any:
    if name is None:
        return None
    stripped = str(name).strip()
    if not stripped:
        raise ValueError("A name is required")
    return stripped


class CharacterChecks(PlainModel):
    """The checks a character's create and update share (fields declared by each)."""

    @field_validator("name", check_fields=False)
    @classmethod
    def _checked_name(cls, value: Any) -> Any:
        return _name(value)

    @field_validator("alternate_greetings", check_fields=False)
    @classmethod
    def _checked_greetings(cls, value: Any) -> Any:
        return _greetings(value)

    @field_validator("tags", check_fields=False)
    @classmethod
    def _checked_tags(cls, value: Any) -> Any:
        return _tags(value)

    @field_validator("avatar", check_fields=False)
    @classmethod
    def _checked_avatar(cls, value: Any) -> Any:
        return _avatar(value)

    @field_validator("extensions", check_fields=False)
    @classmethod
    def _checked_extensions(cls, value: Any) -> Any:
        return _extensions(value)


class PersonaChecks(PlainModel):
    """The checks a persona's create and update share."""

    @field_validator("name", check_fields=False)
    @classmethod
    def _checked_name(cls, value: Any) -> Any:
        return _name(value)

    @field_validator("avatar", check_fields=False)
    @classmethod
    def _checked_avatar(cls, value: Any) -> Any:
        return _avatar(value)


class CharacterModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["CharacterManager"]]
    name: str = Field(..., description="Name")
    description: str = Field("", description="Who the character is")
    personality: str = Field("", description="Personality")
    scenario: str = Field("", description="Where the story starts")
    first_message: str = Field("", description="The greeting")
    alternate_greetings: list[str] = Field(default_factory=list, description="Other greetings")
    example_messages: str = Field("", description="Example dialogue")
    system_prompt: str = Field("", description="The card's system prompt")
    post_history_instructions: str = Field("", description="Sent after the chat")
    creator_notes: str = Field("", description="The creator's notes")
    creator: str = Field("", description="Who made the card")
    character_version: str = Field("", description="The card's version")
    tags: list[str] = Field(default_factory=list, description="Tags")
    avatar: str | None = Field(None, description="The picture, as a data URL")
    favourite: bool = Field(False, description="Shown first")
    extensions: dict[str, Any] = Field(default_factory=dict, description="The card's extension data")

    table_comment: ClassVar[str] = "Zephyrex RPG AI character cards"

    class Create(BaseModel, CharacterChecks):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        description: str = Field("", max_length=MAX_CARD)
        personality: str = Field("", max_length=MAX_CARD)
        scenario: str = Field("", max_length=MAX_CARD)
        first_message: str = Field("", max_length=MAX_CARD)
        alternate_greetings: list[str] = Field(default_factory=list)
        example_messages: str = Field("", max_length=MAX_CARD)
        system_prompt: str = Field("", max_length=MAX_CARD)
        post_history_instructions: str = Field("", max_length=MAX_CARD)
        creator_notes: str = Field("", max_length=MAX_CARD)
        creator: str = Field("", max_length=MAX_SHORT)
        character_version: str = Field("", max_length=MAX_SHORT)
        tags: list[str] = Field(default_factory=list)
        avatar: str | None = None
        favourite: bool = False
        extensions: dict[str, Any] = Field(default_factory=dict)

    class Update(BaseModel, CharacterChecks):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        description: str | None = Field(None, max_length=MAX_CARD)
        personality: str | None = Field(None, max_length=MAX_CARD)
        scenario: str | None = Field(None, max_length=MAX_CARD)
        first_message: str | None = Field(None, max_length=MAX_CARD)
        alternate_greetings: list[str] | None = None
        example_messages: str | None = Field(None, max_length=MAX_CARD)
        system_prompt: str | None = Field(None, max_length=MAX_CARD)
        post_history_instructions: str | None = Field(None, max_length=MAX_CARD)
        creator_notes: str | None = Field(None, max_length=MAX_CARD)
        creator: str | None = Field(None, max_length=MAX_SHORT)
        character_version: str | None = Field(None, max_length=MAX_SHORT)
        tags: list[str] | None = None
        avatar: str | None = None
        favourite: bool | None = None
        extensions: dict[str, Any] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class CharacterManager(AbstractBLLManager[CharacterModel], RouterMixin):
    _model = CharacterModel

    def create(self, **kwargs: Any) -> Any:
        # The framework writes only the fields a create sets; a list's or dict's default must be explicit.
        kwargs.setdefault("alternate_greetings", [])
        kwargs.setdefault("tags", [])
        kwargs.setdefault("extensions", {})
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        # Favourites first, then by name: the order the gallery shows (and the lite edition answers).
        rows = super().list(*args, **kwargs)
        if not isinstance(rows, list):
            return rows
        return sorted(rows, key=lambda row: (not getattr(row, "favourite", False), str(getattr(row, "name", "")).lower()))


class PersonaModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["PersonaManager"]]
    name: str = Field(..., description="Name")
    description: str = Field("", description="Who the person plays as")
    avatar: str | None = Field(None, description="The picture, as a data URL")
    is_default: bool = Field(False, description="Used by chats that name no persona")

    table_comment: ClassVar[str] = "Zephyrex RPG AI personas"

    class Create(BaseModel, PersonaChecks):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        description: str = Field("", max_length=MAX_PERSONA)
        avatar: str | None = None
        is_default: bool = False

    class Update(BaseModel, PersonaChecks):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        description: str | None = Field(None, max_length=MAX_PERSONA)
        avatar: str | None = None
        is_default: bool | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class PersonaManager(AbstractBLLManager[PersonaModel], RouterMixin):
    _model = PersonaModel

    def _clear_other_defaults(self, keep_id: str | None) -> None:
        # Only one persona is the default: making one so clears the flag on the others. The
        # framework's update needs the version, so each is updated through the manager itself.
        for other in super().list(is_default=True):
            if other.id != keep_id:
                super().update(other.id, is_default=False)

    def create(self, **kwargs: Any) -> Any:
        if kwargs.get("is_default"):
            self._clear_other_defaults(None)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        updated = super().update(id, **kwargs)
        if kwargs.get("is_default"):
            self._clear_other_defaults(id)
        return updated

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: str(getattr(row, "name", "")).lower()) if isinstance(rows, list) else rows


def not_yours(field: str) -> HTTPException:
    """The framework's validation refusal for a record the request may not use."""
    return HTTPException(
        status_code=422,
        detail={"message": "Validation error", "code": "validation_error", "errors": [{"loc": [field], "msg": f"That {field} is not one of yours"}]},
    )
