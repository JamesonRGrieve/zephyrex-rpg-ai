# SPDX-License-Identifier: AGPL-3.0-or-later
"""Campaign frames (A57, A58), on the framework's records: the same resource, fields and rules as the
lite edition's (client/src/lib/campaignRecords.ts).

``/v1/campaign``: the table's agreement about what kind of game it is: premise, genre, the tone
dials, themes, the weight of each pillar, structure, setting truths, the characters' ties and the
resolution mode. A chat that names it reads it every turn (Prompt.frame_text); its brief is the same
frame shown to the players.
"""

from typing import Any, ClassVar

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

CAMPAIGN: dict[str, Any] = CONTRACT["campaign"]
MAX_NAME: int = LIMITS["name_characters"]
MAX_SHORT: int = LIMITS["short_text_characters"]
MAX_CARD: int = LIMITS["card_field_characters"]
MAX_ITEMS: int = LIMITS["campaign_list_items"]
DIAL_IDS = [dial["id"] for dial in CAMPAIGN["dials"]]


def _name(value: Any) -> Any:
    if value is None:
        return None
    stripped = str(value).strip()
    if not stripped:
        raise ValueError("A name is required")
    return stripped


def _items(value: Any) -> Any:
    if value is None:
        return None
    cleaned = [item.strip() for item in value if isinstance(item, str)]
    if len(cleaned) != len(value) or len(cleaned) > MAX_ITEMS or any(not item or len(item) > MAX_SHORT for item in cleaned):
        raise ValueError(f"At most {MAX_ITEMS} items of 1 to {MAX_SHORT} characters")
    return cleaned


def _scale(value: Any, keys: list[str], low: int, high: int, what: str) -> Any:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - set(keys):
        raise ValueError(f"{what} takes only {', '.join(keys)}")
    if any(isinstance(number, bool) or not isinstance(number, int) or not low <= number <= high for number in value.values()):
        raise ValueError(f"Each of the {what} is a whole number from {low} to {high}")
    return value


def _one_of(value: Any, allowed: list[str], field: str) -> Any:
    if value is not None and value not in allowed:
        raise ValueError(f"{field} is one of {', '.join(allowed)}")
    return value


class FrameChecks(PlainModel):
    @field_validator("name", check_fields=False)
    @classmethod
    def _checked_name(cls, value: Any) -> Any:
        return _name(value)

    @field_validator("themes", "truths", check_fields=False)
    @classmethod
    def _checked_items(cls, value: Any) -> Any:
        return _items(value)

    @field_validator("dials", check_fields=False)
    @classmethod
    def _checked_dials(cls, value: Any) -> Any:
        return _scale(value, DIAL_IDS, *CAMPAIGN["dial_range"], "dials")

    @field_validator("pillars", check_fields=False)
    @classmethod
    def _checked_pillars(cls, value: Any) -> Any:
        return _scale(value, CAMPAIGN["pillars"], *CAMPAIGN["pillar_range"], "pillars")

    @field_validator("structure", check_fields=False)
    @classmethod
    def _checked_structure(cls, value: Any) -> Any:
        return _one_of(value, CAMPAIGN["structures"], "structure")

    @field_validator("resolution_mode", check_fields=False)
    @classmethod
    def _checked_mode(cls, value: Any) -> Any:
        return _one_of(value, CAMPAIGN["resolution_modes"], "resolution_mode")


class CampaignModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["CampaignManager"]]
    name: str = Field(..., description="Name")
    premise: str = Field("", description="The one-paragraph promise of the campaign")
    genre: str = Field("", description="Its genre")
    dials: dict[str, int] = Field(default_factory=dict, description="Tone dials, each -2 to 2 (0: balanced)")
    themes: list[str] = Field(default_factory=list, description="What the story is about")
    pillars: dict[str, int] = Field(default_factory=dict, description="The weight of combat, exploration, social play and mystery, each 0 to 3")
    structure: str | None = Field(None, description="sandbox, linear, episodic or one_shot")
    truths: list[str] = Field(default_factory=list, description="Facts the table agrees on before play")
    characters: str = Field("", description="The characters' ties to each other and the setting, and what each player wants")
    resolution_mode: str | None = Field(None, description="narrative, mechanical or hybrid")

    table_comment: ClassVar[str] = "Zephyrex RPG AI campaign frames"

    class Create(FrameChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        premise: str = Field("", max_length=MAX_CARD)
        genre: str = Field("", max_length=MAX_SHORT)
        dials: dict[str, int] = Field(default_factory=dict)
        themes: list[str] = Field(default_factory=list)
        pillars: dict[str, int] = Field(default_factory=dict)
        structure: str | None = None
        truths: list[str] = Field(default_factory=list)
        characters: str = Field("", max_length=MAX_CARD)
        resolution_mode: str | None = None

    class Update(FrameChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        premise: str | None = Field(None, max_length=MAX_CARD)
        genre: str | None = Field(None, max_length=MAX_SHORT)
        dials: dict[str, int] | None = None
        themes: list[str] | None = None
        pillars: dict[str, int] | None = None
        structure: str | None = None
        truths: list[str] | None = None
        characters: str | None = Field(None, max_length=MAX_CARD)
        resolution_mode: str | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


FRAME_FIELDS = ("premise", "genre", "dials", "themes", "pillars", "structure", "truths", "characters", "resolution_mode")


class CampaignManager(AbstractBLLManager[CampaignModel], RouterMixin):
    _model = CampaignModel

    def create(self, **kwargs: Any) -> Any:
        for key, value in (("premise", ""), ("genre", ""), ("dials", {}), ("themes", []), ("pillars", {}), ("truths", []), ("characters", "")):
            kwargs.setdefault(key, value)
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        # By name (as the lite edition answers).
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: row.name) if isinstance(rows, list) else rows


def frame_of(campaign: Any) -> dict[str, Any]:
    """A campaign record's frame, as Prompt.frame_text reads it."""
    return {field: getattr(campaign, field) for field in FRAME_FIELDS}
