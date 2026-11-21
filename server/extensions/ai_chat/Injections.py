# SPDX-License-Identifier: AGPL-3.0-or-later
"""STscript's /inject (audit gap 5): a chat's named injections, kept until flushed. Each has an id, its
text, and where it goes (``chat``: at a depth in the chat, with a role; ``before`` or ``after``: at the
start or end of the system prompt).

The twin of client/src/features/chat/injections.ts (its validator), held to
contract/injection-cases.json.
"""

from __future__ import annotations

from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

INJECTIONS: dict[str, Any] = CONTRACT["injections"]


def injections_problem(value: Any) -> str | None:
    """Why ``value`` can't be kept as a chat's injections, or None."""
    if not isinstance(value, list):
        return "Injections are a list"
    if len(value) > INJECTIONS["max"]:
        return f"At most {INJECTIONS['max']} injections"
    ids: set[str] = set()
    for item in value:
        injection = item if isinstance(item, dict) else {}
        id_, text, depth = injection.get("id"), injection.get("text"), injection.get("depth")
        if not isinstance(id_, str) or not id_.strip() or len(id_) > INJECTIONS["id_characters"]:
            return f"An injection's id is text of 1 to {INJECTIONS['id_characters']} characters"
        if id_ in ids:
            return f"{id_} is injected twice"
        ids.add(id_)
        if not isinstance(text, str) or len(text) > INJECTIONS["text_characters"]:
            return f"An injection's text is at most {INJECTIONS['text_characters']} characters"
        if injection.get("position") not in INJECTIONS["positions"]:
            return f"An injection's position is {', '.join(INJECTIONS['positions'])}"
        if isinstance(depth, bool) or not isinstance(depth, int) or not 0 <= depth <= INJECTIONS["depth_max"]:
            return f"An injection's depth is a whole number from 0 to {INJECTIONS['depth_max']}"
        if injection.get("role") not in INJECTIONS["roles"]:
            return f"An injection's role is {', '.join(INJECTIONS['roles'])}"
    return None
