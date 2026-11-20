# SPDX-License-Identifier: AGPL-3.0-or-later
"""Server voices (A29): what is sent to a model set to speak, and what is accepted back.

The lite twin is client/src/lib/speech.ts; both run contract/speech-cases.json.
"""

from __future__ import annotations

import base64
import re
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

SPEECH: dict[str, Any] = CONTRACT["speech"]


def speech_url(base_url: str) -> str:
    """The address a server speaks at (OpenAI-compatible ``POST /audio/speech``)."""
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/")) + str(SPEECH["path"])


def speech_body(model: str, text: str, voice: str | None, speed: float) -> dict[str, Any]:
    """The request for a line read aloud: the contract's default voice when none is chosen."""
    return {
        "model": model,
        "input": text,
        "voice": voice or SPEECH["default_voice"],
        "speed": speed,
        "response_format": SPEECH["format"],
    }


def audio_type(content_type: str | None) -> str | None:
    """The media type of a model's answer when it is audio, without parameters; otherwise None."""
    if content_type is None:
        return None
    media = content_type.split(";", 1)[0].strip().lower()
    return media if media.startswith("audio/") else None


def audio_data_url(media_type: str, audio: bytes) -> str:
    """The audio as a data URL the browser can play."""
    return f"data:{media_type};base64,{base64.b64encode(audio).decode('ascii')}"
