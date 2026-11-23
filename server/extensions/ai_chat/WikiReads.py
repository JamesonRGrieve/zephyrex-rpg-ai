# SPDX-License-Identifier: AGPL-3.0-or-later
"""The wiki's world entities, read through the wiki's own abilities (the composed suite: another
product is reached through its API, never its tables), under the requester's access.

- ``world_entities_page``: a campaign's entities and its setting's canon, every page.
- ``world_entities_by_id``: specific entities (a sandbox chat's persons from other campaigns), through
  ``world_entities_by_id`` when the wiki has it; none otherwise.

A reply is assembled synchronously, so an ability that answers asynchronously gives nothing.
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

WORLD_LORE: dict[str, Any] = CONTRACT["world_lore"]

#: One turn builds its prompt several times (the narration, clarify, needs_roll, next_turn, map_step, the
#: status line), and a campaign's world with its setting's canon is thousands of records (Self Hosted AI,
#: 2026-11-22: the wait was spent before the GPU). Each requester's campaign is read whole once; after
#: that only what changed since (the ability's since, tombstones included), merged by id.
_WORLD: dict[tuple[str, str], tuple[datetime, dict[str, dict[str, Any]]]] = {}


def _sync(answer: Any) -> Any:
    if inspect.isawaitable(answer):
        close = getattr(answer, "close", None)
        if callable(close):
            close()
        return None
    return answer


def world_entities_page(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[dict[str, Any]]:
    """A campaign's entities and its setting's canon, every page; none without the wiki or a campaign."""
    if campaign_id is None:
        return []
    read = loaded_ability(model_registry, "rpg_core", "world_entities")
    if read is None:
        return []
    key = (requester_id, campaign_id)
    cached = _WORLD.get(key)
    since = cached[0] if cached is not None else None
    # Taken before reading, so a change made while the pages are read is read again next time.
    asked_at = datetime.now(UTC)
    found: list[dict[str, Any]] = []
    after: str | None = None
    for _ in range(WORLD_LORE["max_pages"]):
        limit = WORLD_LORE["page_limit"]
        try:
            # The campaign's own records only: a setting's canon comes by relevance (world_matching), never in bulk.
            answer = read(
                model_registry, requester_id, campaign_id, since=since, after=after, limit=limit, include_setting=False
            )
            page = _sync(answer)
        except HTTPException:
            # A campaign the requester can't see, or one that's gone, holds nothing for them.
            _WORLD.pop(key, None)
            return []
        if not isinstance(page, dict):
            return found if cached is None else list(cached[1].values())
        found.extend(page.get("world_entities") or [])
        after = page.get("next")
        if not after:
            break
    merged = dict(cached[1]) if cached is not None else {}
    for entity in found:
        merged[str(entity.get("id"))] = entity
    _WORLD[key] = (asked_at, merged)
    return list(merged.values())


def world_matching(
    model_registry: Any, requester_id: str, campaign_id: str | None, text: str
) -> list[dict[str, Any]] | None:
    """The records the text names (name, alias or keyword) plus the always-active, from the campaign and its
    setting's canon, through the wiki's key index (world_entities_matching): the narrator's relevance read.
    None without the ability, so the caller goes on without canon."""
    if not campaign_id:
        return []
    read = loaded_ability(model_registry, "rpg_core", "world_entities_matching")
    if read is None:
        return None
    try:
        page = _sync(read(model_registry, requester_id, campaign_id, text, limit=int(WORLD_LORE["matching_limit"])))
    except HTTPException:
        return []
    rows = page.get("world_entities") if isinstance(page, dict) else None
    return list(rows) if isinstance(rows, list) else []


def world_entities_by_id(model_registry: Any, requester_id: str, ids: list[str]) -> list[dict[str, Any]]:
    """Specific entities the requester can see, by id; none without the wiki's ability."""
    if not ids:
        return []
    read = loaded_ability(model_registry, "rpg_core", "world_entities_by_id")
    if read is None:
        return []
    try:
        page = _sync(read(model_registry, requester_id, ids))
    except HTTPException:
        return []
    rows = page.get("world_entities") if isinstance(page, dict) else None
    return list(rows) if isinstance(rows, list) else []


def persons_for(
    model_registry: Any, requester_id: str, campaign_id: str | None, ids: list[str]
) -> list[dict[str, Any]]:
    """The world entities a chat's persons come from: its campaign's, and any of ``ids`` it doesn't hold
    read by id."""
    entities = world_entities_page(model_registry, requester_id, campaign_id)
    held = {str(entity["id"]) for entity in entities if entity.get("kind") == "person" and not entity.get("deleted")}
    missing = [id_ for id_ in dict.fromkeys(ids) if id_ not in held]
    return [*entities, *world_entities_by_id(model_registry, requester_id, missing)]


#: One turn's world (the operator, 2026-11-22: "Context injection should be the same for every prompt in a
#: turn"): the first build of a turn reads it, later builds of that turn reuse it; any change rpg-ai makes
#: to the wiki (a person made, filled, moved; the clock; a sheet) starts it over.
_TURNS: dict[tuple[str, str], tuple[str, tuple[str, ...], list[dict[str, Any]]]] = {}


#: One turn's lore passages (the wiki's lore_search, once per turn): (the turn's start, the passages).
_LORE: dict[tuple[str, str], tuple[str, list[dict[str, Any]]]] = {}


def forget_turns() -> None:
    """Every turn's world read again on its next build: rpg-ai just changed the wiki."""
    _TURNS.clear()
    _LORE.clear()


def lore_passages(
    model_registry: Any, requester_id: str, chat_id: str, turn: str | None, campaign_id: str | None, text: str
) -> list[dict[str, Any]] | None:
    """The turn's lore passages from the wiki's hybrid search (lore_search: named records first, then full
    text, trigram and vector ranks fused), once per turn and within the contract's budget; None without
    the ability. Its methods are logged, to see on prod whether vectors were used."""
    from zephyrex.lib.Logging import logger

    if not campaign_id or not text.strip():
        return []
    key = (requester_id, chat_id)
    cached = _LORE.get(key)
    if turn is not None and cached is not None and cached[0] == turn:
        return list(cached[1])
    search = loaded_ability(model_registry, "rpg_core", "lore_search")
    if search is None:
        return None
    try:
        answer = _sync(
            search(
                model_registry,
                requester_id,
                campaign_id,
                text,
                k=int(WORLD_LORE["search_k"]),
                token_budget=int(WORLD_LORE["search_tokens"]),
            )
        )
    except HTTPException:
        return []
    passages = list(answer.get("passages") or []) if isinstance(answer, dict) else []
    logger.info(
        "lore_search %s: %s passages by %s",
        campaign_id,
        len(passages),
        answer.get("methods") if isinstance(answer, dict) else None,
    )
    if turn is not None:
        _LORE[key] = (turn, passages)
    return passages


def persons_for_turn(
    model_registry: Any, requester_id: str, chat_id: str, turn: str | None, campaign_id: str | None, ids: list[str]
) -> list[dict[str, Any]]:
    """persons_for, read once per turn (``turn``: the id of the person's line that started it)."""
    key = (requester_id, chat_id)
    cached = _TURNS.get(key)
    if turn is not None and cached is not None and cached[0] == turn and cached[1] == tuple(ids):
        return list(cached[2])
    entities = persons_for(model_registry, requester_id, campaign_id, ids)
    if turn is not None:
        _TURNS[key] = (turn, tuple(ids), entities)
    return entities


def campaign_documents(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[dict[str, Any]]:
    """A campaign's documents for the data bank (mapping item 4: journals, lore and each entry's whole
    text), through the wiki's campaign_documents ability; none without it or a campaign."""
    if campaign_id is None:
        return []
    read = loaded_ability(model_registry, "rpg_core", "campaign_documents")
    if read is None:
        return []
    try:
        rows = _sync(read(model_registry, requester_id, campaign_id))
    except HTTPException:
        return []
    if isinstance(rows, dict):
        rows = rows.get("campaign_documents")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


async def test_options(model_registry: Any, requester_id: str, person_id: str) -> dict[str, Any] | None:
    """What a test can name for a character under the campaign's system pack (the VTT's test_options),
    or None without the VTT, a pack or access: the light dice style then."""
    read = loaded_ability(model_registry, "rpg_dice", "test_options")
    if read is None:
        return None
    try:
        answer = read(requester_id, person_id)
        options = await answer if inspect.isawaitable(answer) else answer
    except HTTPException:
        return None
    return dict(options) if isinstance(options, dict) else None


async def _call(ability: Any, *args: Any, **kwargs: Any) -> Any:
    """An ability's answer, awaited when it's a coroutine; None when it refuses (an HTTPException)."""
    try:
        answer = ability(*args, **kwargs)
        return await answer if inspect.isawaitable(answer) else answer
    except HTTPException:
        return None


async def advance_clock(
    model_registry: Any, requester_id: str, campaign_id: str, minutes: int, reason: str
) -> dict[str, Any] | None:
    """The wiki campaign's clock moved on (the GM's alone): {minutes, day, time}, or None when refused."""
    advance = loaded_ability(model_registry, "rpg_core", "advance_clock")
    if advance is None:
        return None
    forget_turns()
    clock = await _call(advance, model_registry, requester_id, campaign_id, minutes, reason=reason)
    return dict(clock) if isinstance(clock, dict) and "day" in clock and "time" in clock else None


async def move_person(model_registry: Any, requester_id: str, person_id: str, location_id: str, reason: str) -> bool:
    """A person moved to a real place: by the VTT's pilot_token when it's loaded (its token follows, and it
    sets the wiki location), else by the wiki's move_person (the GM's alone). False when refused."""
    forget_turns()
    pilot = loaded_ability(model_registry, "rpg_scene", "pilot_token")
    if pilot is not None and await _call(pilot, requester_id, person_id, location_id=location_id) is not None:
        return True
    move = loaded_ability(model_registry, "rpg_core", "move_person")
    if move is None:
        return False
    return await _call(move, model_registry, requester_id, person_id, location_id, reason=reason) is not None


async def ensure_person(
    model_registry: Any, requester_id: str, campaign_id: str, name: str, summary: str
) -> dict[str, Any] | None:
    """Someone the narrator voiced who isn't a person yet, made one (the wiki's ensure_person: a GM-only npc
    in the campaign, the same one if the name is already there); None without the ability or when refused."""
    ensure = loaded_ability(model_registry, "rpg_core", "ensure_person")
    if ensure is None:
        return None
    forget_turns()
    person = await _call(ensure, model_registry, requester_id, campaign_id, name, summary=summary)
    return dict(person) if isinstance(person, dict) and person.get("id") else None


def campaign_framing(model_registry: Any, requester_id: str, campaign_id: str | None) -> dict[str, Any] | None:
    """A wiki campaign's own framing (description, Framing, GM notes as the requester may see them,
    setting, play styles; the scenario's when the playthrough's is empty), or None without the wiki's
    campaign_framing ability or a campaign."""
    if not campaign_id:
        return None
    read = loaded_ability(model_registry, "rpg_core", "campaign_framing")
    if read is None:
        return None
    answer = _sync(read(model_registry, requester_id, campaign_id))
    framing = answer.get("campaign_framing") if isinstance(answer, dict) else None
    return framing if isinstance(framing, dict) else None


async def update_person(
    model_registry: Any, requester_id: str, person_id: str, fields: dict[str, Any]
) -> dict[str, Any] | None:
    """A person filled in (the wiki's update_person: summary, entry, personality, motive, voice, picture),
    or None without the ability or when refused."""
    update = loaded_ability(model_registry, "rpg_core", "update_person")
    if update is None:
        return None
    forget_turns()
    done = await _call(update, model_registry, requester_id, person_id, fields)
    return dict(done) if isinstance(done, dict) else None


async def npc_sheet(
    model_registry: Any, requester_id: str, person_id: str, role: str, hint: str, option_id: str | None = None
) -> dict[str, Any] | None:
    """A new NPC's sheet from the VTT's compendium for the campaign's system (rpg_builder's npc_sheet):
    never a model's numbers. ``option_id`` names the block to build (npc_sheet_options); without it the
    VTT's closest match. None without the ability, or when the system has no blocks."""
    build = loaded_ability(model_registry, "rpg_builder", "npc_sheet")
    if build is None:
        return None
    forget_turns()
    extra = {"option_id": option_id} if option_id else {}
    built = await _call(build, requester_id, person_id, role, hint=hint, **extra)
    return dict(built) if isinstance(built, dict) else None


async def npc_sheet_options(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[dict[str, Any]]:
    """What the campaign's pack can build an NPC from (rpg_builder's npc_sheet_options: stat blocks, each
    {id, name, level_or_cr, class, subclass, summary}); none without the ability or a pack."""
    options_of = loaded_ability(model_registry, "rpg_builder", "npc_sheet_options") if campaign_id else None
    if options_of is None:
        return []
    found = await _call(options_of, requester_id, campaign_id)
    options = found.get("options") if isinstance(found, dict) else None
    return [dict(one) for one in options or [] if isinstance(one, dict) and one.get("id") and one.get("name")]


async def character_sheet(model_registry: Any, requester_id: str, person_id: str) -> dict[str, Any] | None:
    """A person's sheet from the VTT (rpg_dice's character_sheet: system, gear, abilities), or None without
    the ability, a sheet, or the requester's access."""
    read = loaded_ability(model_registry, "rpg_dice", "character_sheet")
    if read is None:
        return None
    sheet = await _call(read, requester_id, person_id)
    return dict(sheet) if isinstance(sheet, dict) else None


async def scene_now(model_registry: Any, requester_id: str, campaign_id: str | None) -> dict[str, Any] | None:
    """The campaign's current scene from the VTT (current_scene: id, location_id, background_url…), or None."""
    scene_of = loaded_ability(model_registry, "rpg_scene", "current_scene") if campaign_id else None
    if scene_of is None:
        return None
    try:
        scene = await _call(scene_of, requester_id, campaign_id)
    except HTTPException:
        return None
    return dict(scene) if isinstance(scene, dict) and scene.get("id") else None


async def scene_people(model_registry: Any, requester_id: str, campaign_id: str | None) -> list[str] | None:
    """Who is present (the operator, 2026-11-23: "who is present is who is in the current scene"): the
    wiki persons with a token on the campaign's current VTT scene; None without the VTT, a scene or anyone
    on it, so presence falls back to places and the recent lines."""
    tokens_of = loaded_ability(model_registry, "rpg_scene", "scene_tokens")
    scene = await scene_now(model_registry, requester_id, campaign_id) if tokens_of is not None else None
    if scene is None or tokens_of is None:
        return None
    try:
        tokens = await _call(tokens_of, requester_id, str(scene["id"]))
    except HTTPException:
        return None
    if not isinstance(tokens, list):
        return None
    people = [str(token["entity_id"]) for token in tokens if isinstance(token, dict) and token.get("entity_id")]
    # A scene with no one linked on it isn't set up yet: presence falls back rather than empty the room.
    return people or None


async def set_scene_background(model_registry: Any, requester_id: str, scene_id: str, link: str) -> bool:
    """A scene's map picture set (the VTT's set_scene_background, as the campaign's GM); False without it."""
    setting = loaded_ability(model_registry, "rpg_scene", "set_scene_background")
    if setting is None:
        return False
    try:
        await _call(setting, requester_id, scene_id, link)
    except HTTPException:
        return False
    return True


async def place_in_scene(
    model_registry: Any, requester_id: str, campaign_id: str | None, person_id: str, near_person_id: str | None
) -> dict[str, Any] | None:
    """A person put on the campaign's current scene beside ``near_person_id``'s token (the VTT's
    current_scene and place_person; their wiki location follows), or None without the VTT or a scene."""
    if not campaign_id:
        return None
    scene_of = loaded_ability(model_registry, "rpg_scene", "current_scene")
    place = loaded_ability(model_registry, "rpg_scene", "place_person")
    if scene_of is None or place is None:
        return None
    scene = await _call(scene_of, requester_id, campaign_id)
    if not isinstance(scene, dict) or not scene.get("id"):
        return None
    forget_turns()
    placed = await _call(place, requester_id, str(scene["id"]), person_id, near_person_id=near_person_id)
    return dict(placed) if isinstance(placed, dict) else None
