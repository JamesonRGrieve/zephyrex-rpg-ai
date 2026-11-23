# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn (contract combat_turn): the questions over the VTT's combat_options, and the
picks read back. A decision model chooses only among the options the VTT lists, so nothing is invented;
the VTT's take_combat_action resolves them with its own rolls.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

COMBAT: dict[str, Any] = CONTRACT["combat_turn"]


def combat_questions(
    options: Mapping[str, Any], name: str, who: str
) -> tuple[dict[str, dict[str, Any]], dict[str, str], dict[str, str]]:
    """The questions for one turn (action, target), asked together, and what each answer picks:
    (questions, action label → action id, target label → person id). None asked off its turn."""
    if not options.get("turn") or not options.get("action_available"):
        return {}, {}, {}
    actions = [one for one in options.get("actions") or [] if one.get("id") and one.get("name")]
    if not actions:
        return {}, {}, {}
    hold = str(COMBAT["hold"])
    by_action = {str(one["name"]): str(one["id"]) for one in actions}
    questions: dict[str, dict[str, Any]] = {
        "action": {
            "type": "choice",
            "instructions": str(COMBAT["action_question"])
            .replace("{{name}}", name)
            .replace("{{who}}", who.strip() or name)
            .replace("{{hold}}", hold),
            "criteria": {**{str(one["name"]): str(one.get("summary") or "") for one in actions}, hold: ""},
        }
    }
    reachable = {str(target) for one in actions for target in one.get("targets") or []}
    targets = [one for one in options.get("targets") or [] if str(one.get("person_id")) in reachable]
    # The hostile first: a combatant aims at its enemies unless the story says otherwise.
    targets.sort(key=lambda one: not one.get("hostile"))
    by_target = {str(one["name"]): str(one["person_id"]) for one in targets if one.get("name")}
    if by_target:
        unchecked = f" {COMBAT['reach_unchecked']}" if options.get("reach") == "unchecked" else ""
        questions["target"] = {
            "type": "choice",
            "instructions": str(COMBAT["target_question"]).replace("{{name}}", name) + unchecked,
            "criteria": {
                str(one["name"]): "hostile" if one.get("hostile") else "friendly" for one in targets if one.get("name")
            },
        }
    return questions, by_action, by_target


def combat_pick(
    answers: Mapping[str, Any] | None,
    options: Mapping[str, Any],
    by_action: Mapping[str, str],
    by_target: Mapping[str, str],
) -> dict[str, Any] | None:
    """The action to take ({action_id, target_ids}), or None to hold (or an answer outside the options)."""
    chosen = ((answers or {}).get("action") or {}).get("choice")
    action_id = by_action.get(str(chosen)) if chosen else None
    if action_id is None:
        return None
    action = next(one for one in options.get("actions") or [] if str(one.get("id")) == action_id)
    if not action.get("needs_target"):
        return {"action_id": action_id, "target_ids": []}
    aimed = ((answers or {}).get("target") or {}).get("choice")
    target = by_target.get(str(aimed)) if aimed else None
    if target is None or target not in {str(one) for one in action.get("targets") or []}:
        return None
    return {"action_id": action_id, "target_ids": [target]}
