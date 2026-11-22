# SPDX-License-Identifier: AGPL-3.0-or-later
"""A wiki campaign's own framing as the prompt's frame (Zephyrex RPG, 2026-11-22): its description and
Framing section are the premise, its setting the genre, its play styles the themes, and its GM notes the
GM's style (read by the GM's voices only).

The twin of client/src/features/prompt/campaignFraming.ts, held to contract/campaign-framing-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any


def frame_from_framing(framing: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """The frame the prompt reads (frame_text, gm_style_text); None when the framing says nothing."""
    if framing is None:
        return None
    texts = (str(framing.get("description") or ""), str(framing.get("framing") or ""))
    premise = [part.strip() for part in texts if part.strip()]
    setting = framing.get("setting")
    named: tuple[str, ...] = ()
    if isinstance(setting, Mapping):
        # The setting's tone is its whole entry: its first paragraph is the genre line's.
        tone = re.split(r"\n\s*\n", str(setting.get("tone") or "").strip())[0].strip()
        named = (str(setting.get("name") or "").strip(), tone)
    genre = ": ".join(part for part in named if part)
    themes = [str(style).strip() for style in framing.get("play_styles") or [] if str(style).strip()]
    gm_style = str(framing.get("gm_notes") or "").strip()
    if not premise and not genre and not themes and not gm_style:
        return None
    return {"premise": "\n\n".join(premise), "genre": genre, "themes": themes, "gm_style": gm_style}
