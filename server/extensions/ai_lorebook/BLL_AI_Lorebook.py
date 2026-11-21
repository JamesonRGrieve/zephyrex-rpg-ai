# SPDX-License-Identifier: AGPL-3.0-or-later
"""Lorebooks (SillyTavern's World Info), on the framework's records (CRUD routes, ETag/If-Match on
every write): the same resources, fields and rules as the lite edition's
(client/src/lib/loreRecords.ts).

- ``/v1/lorebook``: a named book of entries. Deleting one deletes its entries.
- ``/v1/lorebook_entry``: one entry, the full World Info field surface. Listed by
  ``?lorebook_id=``.
- ``/v1/chat_lore_state``: a chat's lore timers (sticky and cooldown), written by generation.
"""

import inspect
from datetime import UTC, datetime
from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from pydantic import BaseModel as RouteModel
from pydantic import Field, field_validator
from zephyrex.extensions.AbstractExtensionProvider import loaded_ability

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import CONTRACT, LIMITS  # type: ignore[import-not-found]
from zephyrex.extensions.ai_lorebook.WikiSync import sync_plan  # type: ignore[import-not-found]
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

LORE: dict[str, Any] = CONTRACT["lore"]
DEFAULTS: dict[str, int] = LORE["defaults"]
RANGES: dict[str, list[int]] = LORE["ranges"]
MAX_NAME: int = LIMITS["name_characters"]
MAX_SHORT: int = LIMITS["short_text_characters"]
MAX_CARD: int = LIMITS["card_field_characters"]
MAX_KEYS: int = LIMITS["lore_keys_per_entry"]
MAX_KEY: int = LIMITS["lore_key_characters"]
MAX_CONTENT: int = LIMITS["lore_content_characters"]
MAX_ENTRIES: int = LIMITS["lorebook_entries"]
RANGED = {
    "depth": "depth",
    "order": "order",
    "probability": "probability",
    "group_weight": "group_weight",
    "sticky": "timed",
    "cooldown": "timed",
    "delay": "timed",
}


def _invalid(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "message": "Validation error",
            "code": "validation_error",
            "errors": [{"loc": [field], "msg": message}],
        },
    )


def _name(value: Any) -> Any:
    if value is None:
        return None
    stripped = str(value).strip()
    if not stripped:
        raise ValueError("A name is required")
    return stripped


def _keys(keys: Any) -> Any:
    if keys is None:
        return None
    if len(keys) > MAX_KEYS or any(not isinstance(key, str) or not 1 <= len(key) <= MAX_KEY for key in keys):
        raise ValueError(f"At most {MAX_KEYS} keys of 1 to {MAX_KEY} characters")
    return keys


def _one_of(value: Any, allowed: list[str], field: str) -> Any:
    if value is not None and value not in allowed:
        raise ValueError(f"{field} is one of {', '.join(allowed)}")
    return value


class BookChecks(PlainModel):
    @field_validator("name", check_fields=False)
    @classmethod
    def _checked_name(cls, value: Any) -> Any:
        return _name(value)


class LorebookModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["LorebookManager"]]
    name: str = Field(..., description="Name")
    description: str = Field("", description="What the book covers")
    wiki_campaign_id: str | None = Field(None, description="The wiki campaign this book is kept in sync with (A15)")
    wiki_synced_at: datetime | None = Field(None, description="When its last sync from the wiki began")

    table_comment: ClassVar[str] = "Zephyrex RPG AI lorebooks (World Info)"

    class Create(BookChecks, BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        description: str = Field("", max_length=MAX_CARD)
        wiki_campaign_id: str | None = Field(None, max_length=MAX_SHORT)

    class Update(BookChecks, BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        description: str | None = Field(None, max_length=MAX_CARD)
        wiki_campaign_id: str | None = Field(None, max_length=MAX_SHORT)

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


# A wiki sync reads the wiki's world_entities a page at a time (A15).
WIKI_PAGE = 500
WIKI_PAGES_MAX = 40


class LorebookSyncRequest(RouteModel):
    lorebook_id: str


class LorebookSyncEnvelope(RouteModel):
    """`{"sync": {"lorebook_id"}}`: the book to bring up to date with its wiki campaign."""

    sync: LorebookSyncRequest


class LorebookSync(RouteModel):
    """What one sync from the wiki changed in the book."""

    created: int
    updated: int
    removed: int


class LorebookManager(AbstractBLLManager[LorebookModel], RouterMixin):
    _model = LorebookModel

    @custom_route(
        method="POST",
        path="/sync",
        input_model=LorebookSyncEnvelope,
        output_model=LorebookSync,
        authentication_type="jwt",
        openapi_tags=("Lorebooks",),
        summary="Bring a book up to date with its wiki campaign (A15)",
        expose_in=(ExposeIn.REST,),
    )
    async def sync_route(self, body: LorebookSyncEnvelope) -> LorebookSync:
        return await self.sync_from_wiki(body.sync.lorebook_id)

    async def sync_from_wiki(self, lorebook_id: str) -> LorebookSync:
        """Pulls the wiki's changes since the last sync into the book: one entry per wiki entity,
        updated in place and removed by its tombstone, the person's own entries never touched
        (contract/wiki-sync-cases.json). Through the wiki's own ability, under the person's access."""
        book = self.get(id=lorebook_id)
        if not book.wiki_campaign_id:
            raise _invalid("wiki_campaign_id", "This lorebook isn't linked to a wiki campaign")
        world_entities = loaded_ability(self.model_registry, "rpg_core", "world_entities")
        if world_entities is None:
            raise HTTPException(status_code=409, detail="The wiki isn't part of this install")
        requester = str(self.requester.id)
        entries = LorebookEntryManager(requester_id=requester, model_registry=self.model_registry)
        current = [
            {
                "id": row.id,
                "wiki_entity_id": row.wiki_entity_id,
                "comment": row.comment,
                "keys": row.keys,
                "content": row.content,
            }
            for row in entries.list(lorebook_id=lorebook_id)
        ]
        started = datetime.now(UTC)
        counts = {"created": 0, "updated": 0, "removed": 0}
        after: str | None = None
        for _ in range(WIKI_PAGES_MAX):
            page = world_entities(
                self.model_registry,
                requester,
                book.wiki_campaign_id,
                since=book.wiki_synced_at,
                after=after,
                limit=WIKI_PAGE,
            )
            if inspect.isawaitable(page):
                page = await page
            plan = sync_plan(current, page["world_entities"])
            for entry in plan["create"]:
                created = entries.create(lorebook_id=lorebook_id, **entry)
                current.append({**entry, "id": created.id})
            for change in plan["update"]:
                entries.update(change["id"], comment=change["comment"], keys=change["keys"], content=change["content"])
                current = [{**row, **change} if row["id"] == change["id"] else row for row in current]
            for entry_id in plan["remove"]:
                entries.delete(entry_id)
                current = [row for row in current if row["id"] != entry_id]
            for counted, planned in (("created", "create"), ("updated", "update"), ("removed", "remove")):
                counts[counted] += len(plan[planned])
            after = page.get("next")
            if after is None:
                break
        else:
            # Too many changes for one sync: what was read is applied; the rest comes next time.
            return LorebookSync(**counts)
        # Not a client's field (it isn't in Update): written as the server-side update it is.
        self.update_trusted(lorebook_id, wiki_synced_at=started)
        return LorebookSync(**counts)

    def delete(self, id: str) -> None:
        # A book's entries go with it.
        entries = LorebookEntryManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        for entry in entries.list(lorebook_id=id):
            entries.delete(entry.id)
        super().delete(id)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return sorted(rows, key=lambda row: str(getattr(row, "name", "")).lower()) if isinstance(rows, list) else rows


class EntryChecks(PlainModel):
    @field_validator("keys", "secondary_keys", check_fields=False)
    @classmethod
    def _checked_keys(cls, value: Any) -> Any:
        return _keys(value)

    @field_validator("selective_logic", check_fields=False)
    @classmethod
    def _checked_logic(cls, value: Any) -> Any:
        return _one_of(value, LORE["selective_logic"], "selective_logic")

    @field_validator("position", check_fields=False)
    @classmethod
    def _checked_position(cls, value: Any) -> Any:
        return _one_of(value, LORE["positions"], "position")

    @field_validator("role", check_fields=False)
    @classmethod
    def _checked_role(cls, value: Any) -> Any:
        return _one_of(value, LORE["depth_roles"], "role")

    @field_validator(*RANGED.keys(), check_fields=False)
    @classmethod
    def _within_range(cls, value: Any, info: Any) -> Any:
        if value is None:
            return None
        low, high = RANGES[RANGED[info.field_name]]
        if not low <= value <= high:
            raise ValueError(f"{info.field_name} is between {low} and {high}")
        return value


class LorebookEntryModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["LorebookEntryManager"]]
    lorebook_id: str = Field(..., description="The book")
    wiki_entity_id: str | None = Field(None, description="The wiki entity it was made from (A15), or none")
    comment: str = Field("", description="The entry's label")
    keys: list[str] = Field(default_factory=list)
    secondary_keys: list[str] = Field(default_factory=list)
    selective_logic: str = Field("and_any")
    content: str = Field("")
    enabled: bool = Field(True)
    constant: bool = Field(False)
    position: str = Field("after_char")
    depth: int = Field(DEFAULTS["depth"])
    role: str = Field("system")
    order: int = Field(DEFAULTS["order"])
    probability: int = Field(DEFAULTS["probability"])
    group: str = Field("", description="Inclusion group")
    group_weight: int = Field(DEFAULTS["group_weight"])
    prioritize: bool = Field(False)
    sticky: int = Field(0)
    cooldown: int = Field(0)
    delay: int = Field(0)
    exclude_recursion: bool = Field(False)
    prevent_recursion: bool = Field(False)
    delay_until_recursion: bool = Field(False)
    case_sensitive: bool | None = Field(None)
    match_whole_words: bool | None = Field(None)
    character_names: list[str] = Field(default_factory=list)
    character_exclude: bool = Field(False)

    table_comment: ClassVar[str] = "Zephyrex RPG AI lorebook entries"

    class Create(EntryChecks, BaseModel):
        lorebook_id: str = Field(..., min_length=1)
        # Set by the wiki sync, never by hand (A15): the wiki entity the entry was made from.
        wiki_entity_id: str | None = Field(None, max_length=MAX_SHORT)
        comment: str = Field("", max_length=MAX_SHORT)
        keys: list[str] = Field(default_factory=list)
        secondary_keys: list[str] = Field(default_factory=list)
        selective_logic: str = "and_any"
        content: str = Field("", max_length=MAX_CONTENT)
        enabled: bool = True
        constant: bool = False
        position: str = "after_char"
        depth: int = DEFAULTS["depth"]
        role: str = "system"
        order: int = DEFAULTS["order"]
        probability: int = DEFAULTS["probability"]
        group: str = Field("", max_length=MAX_SHORT)
        group_weight: int = DEFAULTS["group_weight"]
        prioritize: bool = False
        sticky: int = 0
        cooldown: int = 0
        delay: int = 0
        exclude_recursion: bool = False
        prevent_recursion: bool = False
        delay_until_recursion: bool = False
        case_sensitive: bool | None = None
        match_whole_words: bool | None = None
        character_names: list[str] = Field(default_factory=list)
        character_exclude: bool = False

    # An entry stays in its lorebook; everything else can change.
    class Update(EntryChecks, BaseModel):
        comment: str | None = Field(None, max_length=MAX_SHORT)
        keys: list[str] | None = None
        secondary_keys: list[str] | None = None
        selective_logic: str | None = None
        content: str | None = Field(None, max_length=MAX_CONTENT)
        enabled: bool | None = None
        constant: bool | None = None
        position: str | None = None
        depth: int | None = None
        role: str | None = None
        order: int | None = None
        probability: int | None = None
        group: str | None = Field(None, max_length=MAX_SHORT)
        group_weight: int | None = None
        prioritize: bool | None = None
        sticky: int | None = None
        cooldown: int | None = None
        delay: int | None = None
        exclude_recursion: bool | None = None
        prevent_recursion: bool | None = None
        delay_until_recursion: bool | None = None
        case_sensitive: bool | None = None
        match_whole_words: bool | None = None
        character_names: list[str] | None = None
        character_exclude: bool | None = None

    class Search(ApplicationModel.Search):
        lorebook_id: StringSearchModel | None = None


class LorebookEntryManager(AbstractBLLManager[LorebookEntryModel], RouterMixin):
    _model = LorebookEntryModel

    def create(self, **kwargs: Any) -> Any:
        books = LorebookManager(requester_id=str(self.requester.id), model_registry=self.model_registry)
        try:
            books.get(id=kwargs["lorebook_id"])
        except HTTPException as error:
            raise _invalid("lorebook_id", "That lorebook is not one of yours") from error
        if len(super().list(lorebook_id=kwargs["lorebook_id"])) >= MAX_ENTRIES:
            raise _invalid("lorebook_id", f"A lorebook has at most {MAX_ENTRIES} entries")
        for field in ("keys", "secondary_keys", "character_names"):
            kwargs.setdefault(field, [])
        return super().create(**kwargs)

    def list(self, *args: Any, **kwargs: Any) -> Any:
        rows = super().list(*args, **kwargs)
        return (
            sorted(rows, key=lambda row: (getattr(row, "order", 0), str(getattr(row, "created_at", ""))))
            if isinstance(rows, list)
            else rows
        )


class ChatLoreStateModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ChatLoreStateManager"]]
    chat_id: str = Field(..., description="The chat")
    state: dict[str, Any] = Field(default_factory=dict, description="Each entry's sticky and cooldown ends")

    table_comment: ClassVar[str] = "Zephyrex RPG AI lore timers, one per chat"

    class Create(BaseModel):
        chat_id: str = Field(..., min_length=1)
        state: dict[str, Any] = Field(default_factory=dict)

    class Update(BaseModel):
        state: dict[str, Any] | None = None

    class Search(ApplicationModel.Search):
        chat_id: StringSearchModel | None = None


class ChatLoreStateManager(AbstractBLLManager[ChatLoreStateModel], RouterMixin):
    _model = ChatLoreStateModel

    def read(self, chat_id: str) -> dict[str, Any]:
        found = super().list(chat_id=chat_id)
        return dict(found[0].state) if found else {}

    def save(self, chat_id: str, state: dict[str, Any]) -> None:
        found = super().list(chat_id=chat_id)
        if found:
            super().update(found[0].id, state=state)
        else:
            super().create(chat_id=chat_id, state=state)
