# SPDX-License-Identifier: AGPL-3.0-or-later
"""The scene's location when the VTT isn't loaded to say (A31).

The wiki location the story names most recently, over its last few story lines, so the chat's
background can follow the scene. The lite twin is client/src/features/campaign/sceneLocation.ts;
both run contract/scene-cases.json.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "scene-cases.json").read_text())
WINDOW: int = _CASES["window"]


def _last_named_at(text: str, location: Mapping[str, Any]) -> int:
    last = -1
    for name in [location["name"], *(location.get("aliases") or [])]:
        name = name.strip()
        if not name:
            continue
        for match in re.finditer(rf"(?<![^\W_]){re.escape(name)}(?![^\W_])", text, re.IGNORECASE):
            last = max(last, match.start())
    return last


def scene_location(lines: Sequence[Mapping[str, str]], locations: Sequence[Mapping[str, Any]]) -> str | None:
    """The id of the location the latest story lines name last, or None."""
    story = [line for line in lines if line["channel"] == "story"][-WINDOW:]
    for line in reversed(story):
        best: tuple[int, str] | None = None
        for location in locations:
            at = _last_named_at(line["text"], location)
            if at >= 0 and (best is None or at > best[0]):
                best = (at, location["id"])
        if best is not None:
            return best[1]
    return None
