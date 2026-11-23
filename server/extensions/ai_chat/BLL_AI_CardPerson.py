# SPDX-License-Identifier: AGPL-3.0-or-later
"""A character card's wiki person (the operator's composed suite, 2026-11-21: "A character card imports as
a wiki person with its voice … a reply speaks as that person"; Zephyrex RPG's live bug, 2026-11-23: a
chat with a card answered 422, its cast being persons).

``POST /v1/ai_chat/card_person`` ``{"card_person": {"card_id"}}`` answers ``{person_id, campaign_id}``:
the person the card is linked to, or the card imported once as the requester's person (the wiki's
import_card_person: a person of their own "Characters" campaign, with the card's voice) and then linked,
so a second Chat reuses them. A chat with the card carries that campaign. The link is kept in the card's
extensions (``LINK``).
"""

from __future__ import annotations

from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import BaseModel as PlainModel
from pydantic import Field
from zephyrex.lib.CustomRoute import ExposeIn, custom_route
from zephyrex.logic.AbstractLogicManager import AbstractBLLManager
from zephyrex.pydantic2.fastapi import AuthType, RouterMixin, RouteType

#: Where a card keeps its wiki person: {person_id, campaign_id}.
LINK = "zephyrex_rpg_person"
#: The card's fields the wiki's import reads (contract/card-cases.json in the wiki).
CARD_FIELDS = (
    "name",
    "description",
    "personality",
    "scenario",
    "first_message",
    "alternate_greetings",
    "example_messages",
    "system_prompt",
    "post_history_instructions",
    "tags",
    "extensions",
)


class CardPersonRequest(PlainModel):
    card_id: str = Field(..., min_length=1)


class CardPersonRequestEnvelope(PlainModel):
    card_person: CardPersonRequest


class CardPerson(PlainModel):
    person_id: str
    #: The wiki campaign the person lives in; a chat with the card carries it.
    campaign_id: str
    #: True when the card was imported just now (false: its earlier person).
    imported: bool = False


class CardPersonEnvelope(PlainModel):
    card_person: CardPerson


def card_link(extensions: Any) -> dict[str, str] | None:
    """The person a card is linked to, from its extensions, or None."""
    link = extensions.get(LINK) if isinstance(extensions, dict) else None
    if isinstance(link, dict) and link.get("person_id") and link.get("campaign_id"):
        return {"person_id": str(link["person_id"]), "campaign_id": str(link["campaign_id"])}
    return None


def card_fields(card: Any) -> dict[str, Any]:
    """What the wiki's import is given of a card: its own fields, without rpg-ai's link."""
    fields = {key: getattr(card, key, None) for key in CARD_FIELDS}
    fields["extensions"] = {key: value for key, value in dict(fields.get("extensions") or {}).items() if key != LINK}
    return {key: value for key, value in fields.items() if value not in (None, "", [], {})}


class CardPersonManager(AbstractBLLManager[Any], RouterMixin):
    """Custom routes only (an action manager)."""

    prefix: ClassVar[str | None] = "/v1/ai_chat/card_person"
    tags: ClassVar[list[str] | None] = ["AI Chat"]
    auth_type: ClassVar[AuthType] = AuthType.JWT
    routes_to_register: ClassVar[list[RouteType] | None] = []

    @custom_route(
        method="POST",
        path="",
        input_model=CardPersonRequestEnvelope,
        output_model=CardPersonEnvelope,
        authentication_type="jwt",
        expose_in=(ExposeIn.REST,),
        openapi_tags=("AI Chat",),
        summary="A character card's wiki person: its linked one, or the card imported once (then linked)",
    )
    async def card_person_route(self, body: CardPersonRequestEnvelope) -> CardPersonEnvelope:
        import inspect

        from zephyrex.extensions.AbstractExtensionProvider import loaded_ability
        from zephyrex.extensions.ai_character.BLL_AI_Character import (  # type: ignore[import-not-found]
            CharacterManager,
        )
        from zephyrex.extensions.ai_chat.BLL_AI_Chat import store_picture  # type: ignore[import-not-found]
        from zephyrex.extensions.ai_chat.WikiReads import world_entities_by_id  # type: ignore[import-not-found]

        requester = str(self.requester.id)
        cards = CharacterManager(requester_id=requester, model_registry=self.model_registry)
        card = cards.get(id=body.card_person.card_id)
        link = card_link(card.extensions)
        # A link to a person who is still there is reused; one whose person was deleted is imported again.
        if link is not None and world_entities_by_id(self.model_registry, requester, [link["person_id"]]):
            return CardPersonEnvelope(card_person=CardPerson(**link))
        importing = loaded_ability(self.model_registry, "rpg_core", "import_card_person")
        if importing is None:
            raise HTTPException(status_code=409, detail={"message": "The wiki isn't loaded", "code": "no_wiki"})
        fields = card_fields(card)
        if card.avatar and str(card.avatar).startswith("data:"):
            # The wiki takes a picture as an uploaded asset's id, never a data URL.
            asset = await store_picture(self.model_registry, requester, str(card.name), str(card.avatar))
            if asset is not None:
                fields["avatar"] = asset
        elif card.avatar:
            fields["avatar"] = str(card.avatar)
        made = importing(self.model_registry, requester, fields)
        made = await made if inspect.isawaitable(made) else made
        if not isinstance(made, dict) or not made.get("person_id") or not made.get("campaign_id"):
            raise HTTPException(
                status_code=502, detail={"message": "The wiki made no person for the card", "code": "no_person"}
            )
        link = {"person_id": str(made["person_id"]), "campaign_id": str(made["campaign_id"])}
        cards.update(card.id, extensions={**dict(card.extensions or {}), LINK: link})
        return CardPersonEnvelope(card_person=CardPerson(**link, imported=True))
