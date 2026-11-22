# SPDX-License-Identifier: AGPL-3.0-or-later
"""Campaign frames (A57, A58) and scenarios (A59-A61), on the framework's records: the same resource,
fields and rules as the lite edition's (client/src/lib/campaignRecords.ts).

``/v1/campaign_frame``: the table's agreement about what kind of game it is: premise, genre, the tone
dials, themes, the weight of each pillar, structure, setting truths, the characters' ties and the
resolution mode. A chat that names it reads it every turn (Prompt.frame_text); its brief is the same
frame shown to the players.
"""

from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from pydantic import Field, field_validator

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import CONTRACT, LIMITS  # type: ignore[import-not-found]
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
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
    if (
        len(cleaned) != len(value)
        or len(cleaned) > MAX_ITEMS
        or any(not item or len(item) > MAX_SHORT for item in cleaned)
    ):
        raise ValueError(f"At most {MAX_ITEMS} items of 1 to {MAX_SHORT} characters")
    return cleaned


def _scale(value: Any, keys: list[str], low: int, high: int, what: str) -> Any:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - set(keys):
        raise ValueError(f"{what} takes only {', '.join(keys)}")
    if any(
        isinstance(number, bool) or not isinstance(number, int) or not low <= number <= high
        for number in value.values()
    ):
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
        return _scale(value, DIAL_IDS, CAMPAIGN["dial_range"][0], CAMPAIGN["dial_range"][1], "dials")

    @field_validator("pillars", check_fields=False)
    @classmethod
    def _checked_pillars(cls, value: Any) -> Any:
        return _scale(value, CAMPAIGN["pillars"], CAMPAIGN["pillar_range"][0], CAMPAIGN["pillar_range"][1], "pillars")

    @field_validator("structure", check_fields=False)
    @classmethod
    def _checked_structure(cls, value: Any) -> Any:
        return _one_of(value, CAMPAIGN["structures"], "structure")

    @field_validator("resolution_mode", check_fields=False)
    @classmethod
    def _checked_mode(cls, value: Any) -> Any:
        return _one_of(value, CAMPAIGN["resolution_modes"], "resolution_mode")


class CampaignFrameModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["CampaignFrameManager"]]
    name: str = Field(..., description="Name")
    premise: str = Field("", description="The one-paragraph promise of the campaign")
    genre: str = Field("", description="Its genre")
    dials: dict[str, int] = Field(default_factory=dict, description="Tone dials, each -2 to 2 (0: balanced)")
    themes: list[str] = Field(default_factory=list, description="What the story is about")
    pillars: dict[str, int] = Field(
        default_factory=dict, description="The weight of combat, exploration, social play and mystery, each 0 to 3"
    )
    structure: str | None = Field(None, description="sandbox, linear, episodic or one_shot")
    truths: list[str] = Field(default_factory=list, description="Facts the table agrees on before play")
    characters: str = Field(
        "", description="The characters' ties to each other and the setting, and what each player wants"
    )
    resolution_mode: str | None = Field(None, description="narrative, mechanical or hybrid")
    gm_style: str = Field("", description="How the GM runs the game (A20): read by the GM's voices only")
    wiki_campaign_id: str | None = Field(None, description="The wiki campaign the frame belongs to (wiki loaded)")

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
        gm_style: str = Field("", max_length=MAX_CARD)
        wiki_campaign_id: str | None = Field(None, max_length=MAX_SHORT)

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
        gm_style: str | None = Field(None, max_length=MAX_CARD)
        wiki_campaign_id: str | None = Field(None, max_length=MAX_SHORT)

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


FRAME_FIELDS = (
    "premise",
    "genre",
    "dials",
    "themes",
    "pillars",
    "structure",
    "truths",
    "characters",
    "resolution_mode",
    "gm_style",
)


class FramePair(PlainModel):
    campaign_id: str = Field(..., min_length=1, max_length=MAX_SHORT)
    scenario_id: str = Field(..., min_length=1, max_length=MAX_SHORT)


class FrameBackfill(PlainModel):
    pairs: list[FramePair] = Field(..., max_length=1000)


class FrameBackfillEnvelope(PlainModel):
    backfill: FrameBackfill


class FrameBackfilled(PlainModel):
    #: The playthroughs that got their scenario's frame.
    copied: list[str]


class FrameBackfilledEnvelope(PlainModel):
    backfill: FrameBackfilled


class CampaignFrameManager(AbstractBLLManager[CampaignFrameModel], RouterMixin):
    _model = CampaignFrameModel

    @custom_route(
        method="POST",
        path="/backfill",
        input_model=FrameBackfillEnvelope,
        output_model=FrameBackfilledEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("Campaign frames",),
        summary="Playthroughs started before frames were copied get their scenario's frame (pairs from the wiki)",
    )
    async def backfill_route(self, body: FrameBackfillEnvelope) -> FrameBackfilledEnvelope:
        copied = [
            pair.campaign_id
            for pair in body.backfill.pairs
            if copy_frame(self, self._scenarios(), pair.scenario_id, pair.campaign_id) is not None
        ]
        return FrameBackfilledEnvelope(backfill=FrameBackfilled(copied=copied))

    def _scenarios(self) -> "ScenarioManager":
        return ScenarioManager(requester_id=str(self.requester.id), model_registry=self.model_registry)

    def create(self, **kwargs: Any) -> Any:
        for key, value in (
            ("premise", ""),
            ("genre", ""),
            ("dials", {}),
            ("themes", []),
            ("pillars", {}),
            ("truths", []),
            ("characters", ""),
        ):
            kwargs.setdefault(key, value)
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        # By name (as the lite edition answers).
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: row.name) if isinstance(rows, list) else rows


def frame_for(frames: Any, campaign_id: str | None) -> Any:
    """A campaign's frame: the frame of that id, or, for a wiki campaign (the composed suite; a frame's
    id is never chosen), the frame whose wiki_campaign_id it is. None without one: callers go on."""
    if not campaign_id:
        return None
    try:
        return frames.get(id=campaign_id)
    except HTTPException:
        pass
    found = frames.list(wiki_campaign_id=campaign_id)
    return found[0] if found else None


def copy_frame(frames: Any, scenarios: Any, source_id: str, made_id: str) -> Any:
    """A playthrough's own copy of its scenario's frame, and of the scenarios under it (Zephyrex RPG's
    prod run, 2026-11-22: every playthrough ran without its frame). Nothing when the playthrough has one
    already or the scenario has none; the copy, otherwise."""
    if frame_for(frames, made_id) is not None:
        return None
    source = frame_for(frames, source_id)
    if source is None:
        return None
    copied = {field: getattr(source, field) for field in FRAME_FIELDS}
    made = frames.create(name=source.name, wiki_campaign_id=made_id, **copied)
    for scenario in scenarios.list(campaign_id=str(source.id)):
        scenarios.create(name=scenario.name, campaign_id=str(made.id), **scenario_of(scenario))
    return made


def frame_of(campaign: Any) -> dict[str, Any]:
    """A campaign record's frame, as Prompt.frame_text reads it."""
    return {field: getattr(campaign, field) for field in FRAME_FIELDS}


# ---- scenario --------------------------------------------------------------------------

SCENARIO: dict[str, Any] = CONTRACT["scenario"]
SCENARIO_LIMITS: dict[str, int] = SCENARIO["limits"]
SEGMENTS: list[int] = SCENARIO["clock_segment_range"]


def _text(value: Any, field: str, required: bool = False, limit: int = MAX_SHORT) -> str:
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValueError(f"{field} is {'1' if required else '0'} to {limit} characters of text")
    return value.strip()


def _shaped(value: Any, keys: set[str], field: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"Each of {field} is {{{', '.join(sorted(keys))}}}")
    return value


def _limited(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list) or len(value) > SCENARIO_LIMITS[field]:
        raise ValueError(f"At most {SCENARIO_LIMITS[field]} {field}")
    return value


def _flag(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{field} is true or false")
    return value


VOICE_KEYS = {"name", "rate", "pitch", "server"}


def _voice(value: Any) -> dict[str, Any]:
    """An NPC's voice (voice acting): the same shape as a character's (client voice.ts), checked
    loosely here; the client clamps rate and pitch to its own ranges when it reads one."""
    if not isinstance(value, dict) or not set(value) <= VOICE_KEYS:
        raise ValueError(f"A voice has only {', '.join(sorted(VOICE_KEYS))}")
    for key in ("name", "server"):
        text = value.get(key)
        if text is not None and (not isinstance(text, str) or len(text) > CONTRACT["speech"]["voice_characters"]):
            raise ValueError(
                f"A voice's {key} is a name of at most {CONTRACT['speech']['voice_characters']} characters"
            )
    for key in ("rate", "pitch"):
        number = value.get(key)
        top = CONTRACT["speech"]["speed_range"][1]
        if number is not None and (
            isinstance(number, bool) or not isinstance(number, (int, float)) or not 0 <= number <= top
        ):
            raise ValueError(f"A voice's {key} is a number from 0 to {top}")
    return value


def _cast(value: Any) -> Any:
    if value is None:
        return None
    people = []
    for person in _limited(value, "cast"):
        # A voice (voice acting) is optional; the four parts of a person are not.
        keys = {"name", "agenda", "secret", "disposition"} | (
            {"voice"} if isinstance(person, dict) and "voice" in person else set()
        )
        shaped = _shaped(person, keys, "cast")
        people.append(
            {
                "name": _text(shaped["name"], "A name", required=True),
                "agenda": _text(shaped["agenda"], "An agenda", limit=MAX_CARD),
                "secret": _text(shaped["secret"], "A secret", limit=MAX_CARD),
                "disposition": _text(shaped["disposition"], "A disposition"),
                **({"voice": _voice(shaped["voice"])} if "voice" in shaped else {}),
            }
        )
    return people


def _texts(value: Any, field: str) -> Any:
    if value is None:
        return None
    return [_text(item, f"Each of {field}", required=True) for item in _limited(value, field)]


def _clocks(value: Any) -> Any:
    if value is None:
        return None
    clocks = []
    for clock in _limited(value, "clocks"):
        shaped = _shaped(clock, {"name", "segments", "filled", "advances", "when_full"}, "clocks")
        segments, filled = shaped["segments"], shaped["filled"]
        if isinstance(segments, bool) or not isinstance(segments, int) or not SEGMENTS[0] <= segments <= SEGMENTS[1]:
            raise ValueError(f"A clock has {SEGMENTS[0]} to {SEGMENTS[1]} segments")
        if isinstance(filled, bool) or not isinstance(filled, int) or not 0 <= filled <= segments:
            raise ValueError("A clock's filled segments are 0 to its segments")
        clocks.append(
            {
                "name": _text(shaped["name"], "A clock's name", required=True),
                "segments": segments,
                "filled": filled,
                "advances": _text(shaped["advances"], "What advances a clock"),
                "when_full": _text(shaped["when_full"], "What happens when a clock fills"),
            }
        )
    return clocks


def _secrets(value: Any) -> Any:
    if value is None:
        return None
    secrets = []
    for secret in _limited(value, "secrets"):
        shaped = _shaped(secret, {"truth", "clues"}, "secrets")
        clues = shaped["clues"]
        if not isinstance(clues, list) or len(clues) > SCENARIO_LIMITS["clues_per_secret"]:
            raise ValueError(f"At most {SCENARIO_LIMITS['clues_per_secret']} clues to a secret")
        secrets.append(
            {
                "truth": _text(shaped["truth"], "A truth", required=True, limit=MAX_CARD),
                "clues": [
                    {"text": _text(clue["text"], "A clue", required=True), "found": _flag(clue["found"], "found")}
                    for clue in (_shaped(clue, {"text", "found"}, "clues") for clue in clues)
                ],
            }
        )
    return secrets


def _beats(value: Any) -> Any:
    if value is None:
        return None
    return [
        {"text": _text(beat["text"], "A beat", required=True), "done": _flag(beat["done"], "done")}
        for beat in (_shaped(beat, {"text", "done"}, "beats") for beat in _limited(value, "beats"))
    ]


class ScenarioChecks(PlainModel):
    @field_validator("name", check_fields=False)
    @classmethod
    def _checked_name(cls, value: Any) -> Any:
        return _name(value)

    @field_validator("cast", check_fields=False)
    @classmethod
    def _checked_cast(cls, value: Any) -> Any:
        return _cast(value)

    @field_validator("places", check_fields=False)
    @classmethod
    def _checked_places(cls, value: Any) -> Any:
        return _texts(value, "places")

    @field_validator("outcomes", check_fields=False)
    @classmethod
    def _checked_outcomes(cls, value: Any) -> Any:
        return _texts(value, "outcomes")

    @field_validator("clocks", check_fields=False)
    @classmethod
    def _checked_clocks(cls, value: Any) -> Any:
        return _clocks(value)

    @field_validator("secrets", check_fields=False)
    @classmethod
    def _checked_secrets(cls, value: Any) -> Any:
        return _secrets(value)

    @field_validator("beats", check_fields=False)
    @classmethod
    def _checked_beats(cls, value: Any) -> Any:
        return _beats(value)


class ScenarioModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ScenarioManager"]]
    name: str = Field(..., description="Name")
    campaign_id: str | None = Field(None, description="The campaign it belongs to")
    premise: str = Field("", description="What is going on")
    hook: str = Field("", description="How the characters get pulled in")
    stakes: str = Field("", description="What is lost if nobody acts")
    situation: str = Field("", description="The state of things when play starts")
    cast: list[dict[str, Any]] = Field(default_factory=list, description="Each person's agenda, secret and disposition")
    places: list[str] = Field(default_factory=list, description="Where things happen")
    clocks: list[dict[str, Any]] = Field(
        default_factory=list, description="Progress tracks, each with what advances it and what happens when full"
    )
    secrets: list[dict[str, Any]] = Field(
        default_factory=list, description="Truths the characters can learn, each with its clues (found or not)"
    )
    beats: list[dict[str, Any]] = Field(default_factory=list, description="Optional moments, done or not")
    outcomes: list[str] = Field(default_factory=list, description="How it can end")

    table_comment: ClassVar[str] = "Zephyrex RPG AI scenarios"

    class Create(ScenarioChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        campaign_id: str | None = None
        premise: str = Field("", max_length=MAX_CARD)
        hook: str = Field("", max_length=MAX_CARD)
        stakes: str = Field("", max_length=MAX_CARD)
        situation: str = Field("", max_length=MAX_CARD)
        cast: list[dict[str, Any]] = Field(default_factory=list)
        places: list[str] = Field(default_factory=list)
        clocks: list[dict[str, Any]] = Field(default_factory=list)
        secrets: list[dict[str, Any]] = Field(default_factory=list)
        beats: list[dict[str, Any]] = Field(default_factory=list)
        outcomes: list[str] = Field(default_factory=list)

    class Update(ScenarioChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        campaign_id: str | None = None
        premise: str | None = Field(None, max_length=MAX_CARD)
        hook: str | None = Field(None, max_length=MAX_CARD)
        stakes: str | None = Field(None, max_length=MAX_CARD)
        situation: str | None = Field(None, max_length=MAX_CARD)
        cast: list[dict[str, Any]] | None = None
        places: list[str] | None = None
        clocks: list[dict[str, Any]] | None = None
        secrets: list[dict[str, Any]] | None = None
        beats: list[dict[str, Any]] | None = None
        outcomes: list[str] | None = None

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None
        campaign_id: StringSearchModel | None = None


SCENARIO_FIELDS = ("premise", "hook", "stakes", "situation", "cast", "places", "clocks", "secrets", "beats", "outcomes")


class ScenarioManager(AbstractBLLManager[ScenarioModel], RouterMixin):
    _model = ScenarioModel

    def _check_campaign(self, fields: dict[str, Any]) -> None:
        if fields.get("campaign_id") is not None:
            try:
                CampaignFrameManager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(
                    id=fields["campaign_id"]
                )
            except HTTPException as error:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": "Validation error",
                        "code": "validation_error",
                        "errors": [{"loc": ["campaign_id"], "msg": "That campaign is not one of yours"}],
                    },
                ) from error

    def create(self, **kwargs: Any) -> Any:
        for key in ("premise", "hook", "stakes", "situation"):
            kwargs.setdefault(key, "")
        for key in ("cast", "places", "clocks", "secrets", "beats", "outcomes"):
            kwargs.setdefault(key, [])
        self._check_campaign(kwargs)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_campaign(kwargs)
        return super().update(id, **kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: row.name) if isinstance(rows, list) else rows


def scenario_of(scenario: Any) -> dict[str, Any]:
    """A scenario record as Prompt.scenario_text reads it."""
    return {field: getattr(scenario, field) for field in SCENARIO_FIELDS}


def _copy_frame_on_instantiate(
    model_registry: Any, requester_id: str, source_id: str, made_id: str, id_map: dict[str, str]
) -> None:
    """The wiki's instantiate (a playthrough started from a scenario) copies the scenario's frame too."""
    copy_frame(
        CampaignFrameManager(requester_id=requester_id, model_registry=model_registry),
        ScenarioManager(requester_id=requester_id, model_registry=model_registry),
        source_id,
        made_id,
    )


try:
    from zephyrex.extensions.rpg_core.BLL_RPGCore import (  # type: ignore[import-not-found,attr-defined,unused-ignore]
        AFTER_INSTANTIATE,
    )
except ImportError:
    AFTER_INSTANTIATE = None
if AFTER_INSTANTIATE is not None and _copy_frame_on_instantiate not in AFTER_INSTANTIATE:
    AFTER_INSTANTIATE.append(_copy_frame_on_instantiate)
