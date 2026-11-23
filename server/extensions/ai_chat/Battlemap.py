# SPDX-License-Identifier: AGPL-3.0-or-later
"""A generated battlemap (contract battlemap): the prompt for a scene's place, and which scenes still
need one. The VTT's abilities (current_scene, set_scene_background) say and set it; the drawing is the
campaign owner's image-role model.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

BATTLEMAP: dict[str, Any] = CONTRACT["battlemap"]

#: The scenes a battlemap was already started for (once per scene per process; Regenerate forces it).
_DRAWN: set[str] = set()


def battlemap_prompt(place: str, description: str) -> str:
    """The drawing prompt for a scene at a place: its name, and its summary when it has one."""
    text = str(BATTLEMAP["prompt"]).replace("{{place}}", place.strip() or "a place")
    described = " ".join(description.split())
    return (
        text.replace("{{description}}", described.rstrip(".")) if described else text.replace(": {{description}}", "")
    )


def asset_link(asset_id: str) -> str:
    """The same-origin link a stored picture is shown from."""
    return str(BATTLEMAP["asset_path"]).replace("{{id}}", asset_id)


def needs_battlemap(scene: Mapping[str, Any] | None, force: bool = False) -> bool:
    """Whether a scene gets a drawn map: it has none of its own or its place's (and wasn't started
    already), or the GM asked to draw it again."""
    if not scene or not scene.get("id"):
        return False
    if force:
        return True
    if "background_url" not in scene or scene.get("background_url"):
        # A VTT that doesn't say (before set_scene_background) or a scene with a picture: left alone.
        return False
    return str(scene["id"]) not in _DRAWN


def mark_drawn(scene_id: str) -> None:
    _DRAWN.add(scene_id)
