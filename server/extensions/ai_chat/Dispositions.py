# SPDX-License-Identifier: AGPL-3.0-or-later
"""Grounded state (the operator, 2026-11-21): each person's stance toward each other person, kept on the
chat and updated by the summary model in the same call as the status line. Each voice reads who is here
and its own stances; the narrator reads everyone's.

The twin of client/src/features/chat/dispositions.ts, held to contract/disposition-cases.json.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.StatusLine import status_clean  # type: ignore[import-not-found]

DISPOSITIONS: dict[str, Any] = CONTRACT["dispositions"]


def parse_status(text: str) -> dict[str, Any]:
    """The summary model's answer: its status line and the stances it changed (a plain line works too)."""
    start, end = text.find("{"), text.rfind("}")
    parsed: Any = None
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
        except ValueError:
            parsed = None
    line = parsed.get("status_line") if isinstance(parsed, dict) else None
    if not isinstance(line, str):
        return {"line": status_clean(text), "updates": []}
    listed = parsed.get("dispositions")
    updates = []
    for one in listed if isinstance(listed, list) else []:
        if not isinstance(one, dict):
            continue
        who, toward, stance, reason = (one.get(key) for key in ("who", "toward", "stance", "reason"))
        if isinstance(who, str) and isinstance(toward, str) and stance in DISPOSITIONS["stances"]:
            updates.append(
                {
                    "who": who.strip(),
                    "toward": toward.strip(),
                    "stance": stance,
                    "reason": reason.strip() if isinstance(reason, str) else "",
                }
            )
    return {"line": status_clean(line), "updates": updates}


def apply_stances(
    current: Mapping[str, Any], updates: Sequence[Mapping[str, str]], people: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    """The chat's stances after updates, names resolved among the people (case aside)."""

    def id_of(name: str) -> str | None:
        return next(
            (str(person["id"]) for person in people if str(person["name"]).strip().lower() == name.strip().lower()),
            None,
        )

    result: dict[str, Any] = {who: dict(row) for who, row in current.items()}
    for update in updates:
        who, toward = id_of(update["who"]), id_of(update["toward"])
        if who is None or toward is None or who == toward:
            continue
        result[who] = {**result.get(who, {}), toward: {"stance": update["stance"], "reason": update["reason"]}}
    return result


def scene_state(here: Sequence[Mapping[str, str]], dispositions: Mapping[str, Any], viewer_id: str | None) -> str:
    """What a voice reads of the scene: who is here, then its own stances; the narrator reads everyone's."""
    if len(here) < 2:
        return ""
    names = {one["id"]: one["name"] for one in here}
    listed = ", ".join(f"{one['name']} ({one['line']})" if one["line"] else one["name"] for one in here)
    lines = [f"{DISPOSITIONS['here_heading']} {listed}"]
    for who in here:
        if viewer_id is not None and who["id"] != viewer_id:
            continue
        for toward, stance in (dispositions.get(who["id"]) or {}).items():
            if toward not in names:
                continue
            lines.append(
                str(DISPOSITIONS["stance_line"])
                .replace("{{who}}", who["name"])
                .replace("{{toward}}", names[toward])
                .replace("{{stance}}", str(stance["stance"]))
                .replace("{{reason}}", str(stance["reason"]))
            )
    return "\n".join(lines)
