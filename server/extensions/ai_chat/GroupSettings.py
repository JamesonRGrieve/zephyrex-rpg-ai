# SPDX-License-Identifier: AGPL-3.0-or-later
"""A group chat's modes (audit gap 6), stored as the chat's ``group_settings``: card_mode (swap or join),
join_prefix and join_suffix, order (natural, list or pooled), allow_self, auto_seconds and scenario.
Each is optional; an absent one keeps the default.

The twin of client/src/features/chat/groupSettings.ts, held to contract/group-settings-cases.json.
"""

from __future__ import annotations

from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

GROUP_SETTINGS: dict[str, Any] = CONTRACT["group_settings"]
KEYS = ("card_mode", "join_prefix", "join_suffix", "order", "allow_self", "auto_seconds", "scenario")


def group_settings_problem(value: Any) -> str | None:
    """Why ``value`` can't be kept as a chat's group settings, or None."""
    if not isinstance(value, dict):
        return "Group settings are an object"
    unknown = [key for key in value if key not in KEYS]
    if unknown:
        return f"{', '.join(unknown)} isn't a group setting"
    if "card_mode" in value and value["card_mode"] not in GROUP_SETTINGS["card_modes"]:
        return f"card_mode is {' or '.join(GROUP_SETTINGS['card_modes'])}"
    if "order" in value and value["order"] not in GROUP_SETTINGS["orders"]:
        return f"order is {', '.join(GROUP_SETTINGS['orders'])}"
    if "allow_self" in value and not isinstance(value["allow_self"], bool):
        return "allow_self is true or false"
    low, high = GROUP_SETTINGS["auto_seconds"]
    seconds = value.get("auto_seconds")
    if "auto_seconds" in value and (
        isinstance(seconds, bool) or not isinstance(seconds, int) or not low <= seconds <= high
    ):
        return f"auto_seconds is a whole number from {low} to {high}"
    for key in ("join_prefix", "join_suffix"):
        affix = value.get(key)
        if key in value and (not isinstance(affix, str) or len(affix) > GROUP_SETTINGS["affix_characters"]):
            return f"{key} is text of at most {GROUP_SETTINGS['affix_characters']} characters"
    scenario = value.get("scenario")
    if "scenario" in value and (not isinstance(scenario, str) or len(scenario) > GROUP_SETTINGS["scenario_characters"]):
        return f"scenario is text of at most {GROUP_SETTINGS['scenario_characters']} characters"
    return None
