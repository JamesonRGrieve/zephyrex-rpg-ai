# SPDX-License-Identifier: AGPL-3.0-or-later
"""AI-assisted character creation (contract builder_pick): the VTT builder's unchosen choices, one at a
time in step order, each put to the decision model as a choice among its own options. A decision model
only ever picks from what it is offered, so nothing is invented; ability scores are never picked.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

BUILDER_PICK: dict[str, Any] = CONTRACT["builder_pick"]


def open_choices(builder: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The builder's choices still unmade, in step order, ability scores left out."""
    skip = {str(kind) for kind in BUILDER_PICK["skip_kinds"]}
    steps = sorted(builder.get("steps") or [], key=lambda step: int(step.get("step") or 0))
    return [
        dict(choice)
        for step in steps
        for choice in step.get("choices") or []
        if choice.get("chosen") is None and str(choice.get("kind")) not in skip and choice.get("options")
    ]


def pick_question(choice: Mapping[str, Any]) -> dict[str, Any]:
    """The decision model's question for one choice: its options by name, their descriptions as criteria."""
    options = {str(option["name"]): str(option.get("description") or "").strip()[:300] for option in choice["options"]}
    return {
        "type": "choice",
        "instructions": str(BUILDER_PICK["instruction"]).replace("{{kind}}", str(choice["kind"])),
        "criteria": options,
    }


def pick_state(concept: str, picks: Sequence[Mapping[str, Any]]) -> str:
    """What the decision model reads: the person's concept, and what was picked so far."""
    chosen = "; ".join(f"{pick['kind']}: {pick['name']}" for pick in picks) or str(BUILDER_PICK["nothing_yet"])
    return str(BUILDER_PICK["state"]).replace("{{concept}}", concept.strip()).replace("{{picks}}", chosen)


def picked_option(choice: Mapping[str, Any], answer: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """The option the answer names, or None (no answer, or one outside the options: left to the person)."""
    name = answer.get("choice") if isinstance(answer, Mapping) else None
    return next((dict(option) for option in choice["options"] if option["name"] == name), None)
