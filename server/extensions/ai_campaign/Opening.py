# SPDX-License-Identifier: AGPL-3.0-or-later
"""A campaign's opening tells the person where they are, never asks (the operator, 2026-11-21): the
framing's Opening Situation, then the seat's told position. Each person starts at their wiki location,
else where the VTT scene holding their token is, else (the seat only) the framing's default.

The twin of client/src/features/campaign/opening.ts, held to contract/opening-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

OPENING: dict[str, Any] = CONTRACT["opening"]


def opening_for(
    seated_id: str | None,
    situation: str,
    entities: Sequence[Mapping[str, Any]],
    scene: Mapping[str, Any] | None,
    default_location: str | None,
) -> dict[str, Any]:
    """The opening text, the seat's location id, and where each person starts."""
    live = [entity for entity in entities if not entity.get("deleted")]
    persons = [entity for entity in live if entity.get("kind") == "person"]
    starts: dict[str, str | None] = {}
    for person in persons:
        from_scene = scene["location_id"] if scene is not None and person["id"] in scene["entity_ids"] else None
        own = person.get("location_id")
        starts[person["id"]] = own or from_scene or (default_location if person["id"] == seated_id else None)
    at = starts.get(seated_id) if seated_id is not None else None
    location = next((entity for entity in live if entity.get("kind") == "location" and entity["id"] == at), None)
    parts = [situation.strip()]
    if location is not None:
        others = [
            str(person["name"])
            for person in persons
            if person["id"] != seated_id and not person.get("gm_only") and starts[person["id"]] == location["id"]
        ]
        # The banner: the place, then its parents (town, then region) as the subtitle.
        places: list[str] = []
        by_id = {entity["id"]: entity for entity in live if entity.get("kind") == "location"}
        parent = by_id.get(location.get("parent_id") or "")
        while parent is not None and len(places) < 3:
            places.append(str(parent["name"]))
            parent = by_id.get(parent.get("parent_id") or "")
        within = OPENING["within"].replace("{{places}}", ", ".join(places)) if places else ""
        banner = OPENING["told"].replace("{{location}}", str(location["name"])).replace("{{within}}", within)
        parts = [banner, situation.strip()]
        if others:
            parts.append(OPENING["with"].replace("{{names}}", ", ".join(others)))
    return {
        "text": "\n\n".join(part for part in parts if part),
        "location_id": location["id"] if location is not None else None,
        "starts": starts,
    }
