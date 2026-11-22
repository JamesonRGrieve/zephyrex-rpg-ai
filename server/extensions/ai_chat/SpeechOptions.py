# SPDX-License-Identifier: AGPL-3.0-or-later
"""How a speaker may speak and to whom (the operator, 2026-11-22): always speak, whisper and shout to those
present; a system's further manners only when the speaker's sheet holds what each needs, matched by name.

The twin of client/src/features/chat/speechManners.ts, held to contract/speech-options-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

SPEECH_OPTIONS: dict[str, Any] = CONTRACT["speech_options"]


def _has(names: Sequence[str] | None, wanted: Sequence[str] | None) -> bool:
    return wanted is not None and any(one.lower() in name.lower() for name in names or [] for one in wanted)


def _qualifies(holder: Mapping[str, Any], manner: Mapping[str, Any]) -> bool:
    return _has(holder.get("gear"), manner.get("item")) or _has(holder.get("abilities"), manner.get("spell"))


def _nearby(a: str | None, b: str | None, parents: Mapping[str, str | None]) -> bool:
    if a is None or b is None:
        return False
    up_a, up_b = parents.get(a), parents.get(b)
    return a == b or up_a == b or up_b == a or (up_a is not None and up_a == up_b)


def speech_manners(
    system: str | None,
    speaker: Mapping[str, Any],
    present: Sequence[Mapping[str, Any]],
    known: Sequence[Mapping[str, Any]],
    parents: Mapping[str, str | None],
) -> dict[str, Any]:
    """{manners: [{id, label, reaches}], present: [{id, name}], remote: [{id, name, via}]}."""
    family = SPEECH_OPTIONS["families"].get(system) if system is not None else None
    offered = [manner for manner in SPEECH_OPTIONS["manners"].get(family, []) if _qualifies(speaker, manner)]
    here = {str(one["id"]) for one in present}
    others = [one for one in known if one["id"] != speaker["id"] and str(one["id"]) not in here]
    remote: list[dict[str, str]] = []
    for manner in offered:
        for one in others:
            reached = (
                manner["to"] == "known"
                or (manner["to"] == "carriers" and _qualifies(one, manner))
                or (manner["to"] == "nearby" and _nearby(speaker.get("location_id"), one.get("location_id"), parents))
            )
            if reached and not any(other["id"] == one["id"] for other in remote):
                remote.append({"id": str(one["id"]), "name": str(one["name"]), "via": str(manner["id"])})
    return {
        "manners": [
            *({"id": one["id"], "label": one["label"], "reaches": "present"} for one in SPEECH_OPTIONS["base"]),
            *({"id": one["id"], "label": one["label"], "reaches": one["reaches"]} for one in offered),
        ],
        "present": [{"id": str(one["id"]), "name": str(one["name"])} for one in present],
        "remote": remote,
    }
