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
from zephyrex.extensions.ai_character.Contract import CONTRACT, LIMITS  # type: ignore[import-not-found]
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
PERSONA: dict[str, Any] = CONTRACT["persona"]
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

    @field_validator("folder", check_fields=False)
    @classmethod
    def _checked_folder(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

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

    @field_validator("description_position", check_fields=False)
    @classmethod
    def _checked_position(cls, value: Any) -> Any:
        if value is not None and value not in PERSONA["positions"]:
            raise ValueError(f"description_position is one of {', '.join(PERSONA['positions'])}")
        return value

    @field_validator("description_role", check_fields=False)
    @classmethod
    def _checked_role(cls, value: Any) -> Any:
        if value is not None and value not in PERSONA["roles"]:
            raise ValueError(f"description_role is one of {', '.join(PERSONA['roles'])}")
        return value

    @field_validator("character_ids", check_fields=False)
    @classmethod
    def _checked_locks(cls, value: Any) -> Any:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Each character once")
        return value


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
    folder: str = Field("", description="The gallery folder it sits in (blank: none)")
    extensions: dict[str, Any] = Field(default_factory=dict, description="The card's extension data")
    lorebook_id: str | None = Field(None, description="The character's own lorebook")

    table_comment: ClassVar[str] = "Zephyrex RPG AI character cards"

    class Create(CharacterChecks, BaseModel):
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
        folder: str = Field("", max_length=MAX_NAME)
        extensions: dict[str, Any] = Field(default_factory=dict)
        lorebook_id: str | None = None

    class Update(CharacterChecks, BaseModel):
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
        folder: str | None = Field(None, max_length=MAX_NAME)
        extensions: dict[str, Any] | None = None
        lorebook_id: str | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class CharacterManager(AbstractBLLManager[CharacterModel], RouterMixin):
    _model = CharacterModel

    def create(self, **kwargs: Any) -> Any:
        # The framework writes only the fields a create sets; a list's or dict's default must be explicit.
        kwargs.setdefault("alternate_greetings", [])
        kwargs.setdefault("tags", [])
        kwargs.setdefault("extensions", {})
        self._check_lorebook(kwargs.get("lorebook_id"))
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_lorebook(kwargs.get("lorebook_id"))
        return super().update(id, **kwargs)

    def _check_lorebook(self, lorebook_id: str | None) -> None:
        """A character's own lorebook must be one of the requester's."""
        if lorebook_id is None:
            return
        from zephyrex.extensions.ai_lorebook.BLL_AI_Lorebook import LorebookManager  # type: ignore[import-not-found]

        try:
            LorebookManager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(id=lorebook_id)
        except HTTPException as error:
            raise not_yours("lorebook_id") from error

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
    # Audit gap 9: a title, where the description goes, its own lorebook, the characters it's locked to.
    title: str = Field("", description="A title shown with the name")
    description_position: str = Field("prompt", description="prompt, depth, note_top, note_bottom or none")
    description_depth: int = Field(PERSONA["default_depth"], description="Messages from the end, at a depth")
    description_role: str = Field("system", description="Who says it at a depth: system, user or assistant")
    lorebook_id: str | None = Field(None, description="Its own lorebook, read while it's spoken as")
    character_ids: list[str] = Field(default_factory=list, description="The characters it's locked to")

    table_comment: ClassVar[str] = "Zephyrex RPG AI personas"

    class Create(PersonaChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        description: str = Field("", max_length=MAX_PERSONA)
        avatar: str | None = None
        is_default: bool = False
        title: str = Field("", max_length=PERSONA["title_characters"])
        description_position: str = "prompt"
        description_depth: int = Field(PERSONA["default_depth"], ge=0, le=PERSONA["depth_max"])
        description_role: str = "system"
        lorebook_id: str | None = Field(None, min_length=1)
        character_ids: list[str] = Field(default_factory=list, max_length=PERSONA["locked_characters"])

    class Update(PersonaChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        description: str | None = Field(None, max_length=MAX_PERSONA)
        avatar: str | None = None
        is_default: bool | None = None
        title: str | None = Field(None, max_length=PERSONA["title_characters"])
        description_position: str | None = None
        description_depth: int | None = Field(None, ge=0, le=PERSONA["depth_max"])
        description_role: str | None = None
        lorebook_id: str | None = Field(None, min_length=1)
        character_ids: list[str] | None = Field(None, max_length=PERSONA["locked_characters"])

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

    def _check_references(self, fields: dict[str, Any]) -> None:
        """A persona's lorebook and locked characters must be the requester's own (audit gap 9)."""
        from zephyrex.extensions.ai_lorebook.BLL_AI_Lorebook import LorebookManager

        owner = {"requester_id": str(self.requester.id), "model_registry": self.model_registry}
        if fields.get("lorebook_id") is not None:
            try:
                LorebookManager(**owner).get(id=fields["lorebook_id"])
            except HTTPException as error:
                raise not_yours("lorebook_id") from error
        for character_id in fields.get("character_ids") or []:
            try:
                CharacterManager(**owner).get(id=character_id)
            except HTTPException as error:
                raise not_yours("character_ids") from error

    def create(self, **kwargs: Any) -> Any:
        # The framework writes only the fields a create sets; a list's default must be explicit.
        kwargs.setdefault("character_ids", [])
        kwargs.setdefault("title", "")
        kwargs.setdefault("description_position", "prompt")
        kwargs.setdefault("description_depth", PERSONA["default_depth"])
        kwargs.setdefault("description_role", "system")
        self._check_references(kwargs)
        if kwargs.get("is_default"):
            self._clear_other_defaults(None)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_references(kwargs)
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


# ---- character_expression --------------------------------------------------------------

EXPRESSION: dict[str, Any] = CONTRACT["expression"]
_LABEL = re.compile(r"^[^\W_][\w -]*$")


def _expression_label(value: Any) -> Any:
    if value is None:
        return None
    stripped = str(value).strip()
    if not stripped or len(stripped) > EXPRESSION["label_characters"] or not _LABEL.match(stripped) or "_" in stripped:
        raise ValueError("A label is a word or two")
    return stripped


class ExpressionChecks(PlainModel):
    @field_validator("label", check_fields=False)
    @classmethod
    def _checked_label(cls, value: Any) -> Any:
        return _expression_label(value)

    @field_validator("image", check_fields=False)
    @classmethod
    def _checked_image(cls, value: Any) -> Any:
        return _avatar(value)


class CharacterExpressionModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["CharacterExpressionManager"]]
    character_id: str = Field(..., description="The character it shows")
    label: str = Field(..., description="The feeling it shows (joy, anger, …)")
    image: str = Field(..., description="The sprite (a data URL)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI expression sprites"

    class Create(ExpressionChecks, BaseModel):
        character_id: str = Field(..., min_length=1)
        label: str = Field(..., min_length=1, max_length=EXPRESSION["label_characters"])
        image: str = Field(..., min_length=1)

    class Update(ExpressionChecks, BaseModel):
        label: str | None = Field(None, min_length=1, max_length=EXPRESSION["label_characters"])
        image: str | None = None

    class Search(ApplicationModel.Search):
        character_id: StringSearchModel | None = None


class CharacterExpressionManager(AbstractBLLManager[CharacterExpressionModel], RouterMixin):
    _model = CharacterExpressionModel

    def _refuse(self, field: str, message: str) -> HTTPException:
        return HTTPException(status_code=422, detail={"message": "Validation error", "code": "validation_error", "errors": [{"loc": [field], "msg": message}]})

    def create(self, **kwargs: Any) -> Any:
        try:
            CharacterManager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(id=kwargs["character_id"])
        except HTTPException as error:
            raise not_yours("character_id") from error
        existing = super().list(character_id=kwargs["character_id"])
        if len(existing) >= EXPRESSION["per_character"]:
            raise self._refuse("character_id", f"At most {EXPRESSION['per_character']} sprites a character")
        if any(row.label == kwargs["label"] for row in existing):
            raise self._refuse("label", "That character already has a sprite for this label")
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        if kwargs.get("label") is not None:
            row = self.get(id=id)
            if any(other.label == kwargs["label"] and other.id != id for other in super().list(character_id=row.character_id)):
                raise self._refuse("label", "That character already has a sprite for this label")
        return super().update(id, **kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: row.label) if isinstance(rows, list) else rows
