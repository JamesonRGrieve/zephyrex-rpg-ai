# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zephyrex RPG AI's knowledge shared with the client: record limits, message roles and channels,
chat modes, sampler ranges and defaults, and how a prompt is assembled.

They live once, in contract/rpg_ai.json at the repository root, which the self-hosted lite API
and the front end read too (client/src/contract.ts). This module reads it; nothing here restates it.
"""

import json
from pathlib import Path
from typing import Any

# server/extensions/ai_character/Contract.py → the repository root, three levels up.
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPOSITORY_ROOT / "contract" / "rpg_ai.json"
PROMPT_CASES_PATH = REPOSITORY_ROOT / "contract" / "prompt-cases.json"

CONTRACT: dict[str, Any] = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
LIMITS: dict[str, int] = CONTRACT["limits"]
MESSAGE_ROLES: tuple[str, ...] = tuple(CONTRACT["message_roles"])
MESSAGE_CHANNELS: tuple[str, ...] = tuple(CONTRACT["message_channels"])
CHAT_MODES: tuple[str, ...] = tuple(CONTRACT["chat_modes"])
SAMPLER_RANGES: dict[str, list[float]] = CONTRACT["sampler_ranges"]
PRESET_DEFAULTS: dict[str, float] = CONTRACT["preset_defaults"]
PROMPT: dict[str, Any] = CONTRACT["prompt"]
