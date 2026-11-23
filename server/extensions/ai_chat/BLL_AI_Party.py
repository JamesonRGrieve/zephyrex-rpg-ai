# SPDX-License-Identifier: AGPL-3.0-or-later
"""The party put on the map when play starts (Zephyrex RPG's live blocker, 2026-11-23: a campaign just
started had no tokens, so presence was empty from round one).

``POST /v1/ai_chat/place_party`` ``{"place_party": {"chat_id"}}``: each of the chat's cast and the seat's
character with no token on the campaign's current scene is put there beside the seat (the VTT's
place_person; their wiki location follows). Answers ``{placed: [person ids], scene_id}``; without the VTT
or a scene, nothing.
"""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel as PlainModel
from pydantic import Field
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.logic.AbstractLogicManager import AbstractBLLManager
from zephyrex.pydantic2.fastapi import AuthType, RouterMixin, RouteType


class PlacePartyRequest(PlainModel):
    chat_id: str = Field(..., min_length=1)


class PlacePartyRequestEnvelope(PlainModel):
    place_party: PlacePartyRequest


class PartyPlaced(PlainModel):
    #: Who was put on the scene just now (those already on it aren't).
    placed: list[str] = Field(default_factory=list)
    scene_id: str | None = None


class PartyPlacedEnvelope(PlainModel):
    place_party: PartyPlaced


def party_to_place(cast: list[str], seat: str | None, on_scene: list[str]) -> list[str]:
    """The seat's character first (the others are placed beside them), then the cast; none already there."""
    order = [*([seat] if seat else []), *cast]
    return [one for index, one in enumerate(order) if one not in on_scene and one not in order[:index]]


class PlacePartyManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager)."""

    prefix: ClassVar[str | None] = "/v1/ai_chat/place_party"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=PlacePartyRequestEnvelope,
        output_model=PartyPlacedEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="The chat's party put on the campaign's current scene beside the seat (the VTT's place_person)",
    )
    async def place_party_route(self, body: PlacePartyRequestEnvelope) -> PartyPlacedEnvelope:
        from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
            CampaignFrameManager,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import (  # type: ignore[import-not-found]
            ChatManager,
            wiki_campaign_for,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Session import play_context  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import (  # type: ignore[import-not-found]
            place_in_scene,
            scene_now,
            scene_people,
        )

        requester = str(self.requester.id)
        chat = ChatManager(requester_id=requester, model_registry=self.model_registry).get(id=body.place_party.chat_id)
        wiki = wiki_campaign_for(
            CampaignFrameManager(requester_id=requester, model_registry=self.model_registry), chat.campaign_id
        )
        scene = await scene_now(self.model_registry, requester, wiki) if wiki else None
        if scene is None:
            return PartyPlacedEnvelope(place_party=PartyPlaced())
        seat, _marks = play_context(requester, self.model_registry, chat.id)
        on_scene = await scene_people(self.model_registry, requester, wiki) or []
        placed: list[str] = []
        for person_id in party_to_place([str(one) for one in chat.character_ids or []], seat, on_scene):
            near = seat if seat and seat != person_id and (seat in on_scene or seat in placed) else None
            if await place_in_scene(self.model_registry, requester, wiki, person_id, near) is not None:
                placed.append(person_id)
        return PartyPlacedEnvelope(place_party=PartyPlaced(placed=placed, scene_id=str(scene["id"])))
