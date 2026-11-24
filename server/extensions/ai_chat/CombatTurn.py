# SPDX-License-Identifier: AGPL-3.0-or-later
"""An AI-run combatant's turn (contract combat_turn): the questions over the VTT's combat_options, and the
picks read back. A decision model chooses only among the options the VTT lists, so nothing is invented;
the VTT's take_combat_action resolves them with its own rolls.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

COMBAT: dict[str, Any] = CONTRACT["combat_turn"]


def combat_questions(
    options: Mapping[str, Any], name: str, who: str, by_line: bool = False
) -> tuple[dict[str, dict[str, Any]], dict[str, str], dict[str, str]]:
    """The questions for one turn (action, target), asked together, and what each answer picks:
    (questions, action label → action id, target label → person id). None asked off its turn. ``by_line``:
    the person's own turn, their line read for which option it describes (contract action_question_line)."""
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
            "instructions": str(COMBAT["action_question_line" if by_line else "action_question"])
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
            "instructions": str(COMBAT["target_question_line" if by_line else "target_question"]).replace(
                "{{name}}", name
            )
            + unchecked,
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


def combat_stances(
    people: Sequence[Mapping[str, Any]],
    party: Sequence[str],
    chat_dispositions: Mapping[str, Mapping[str, str]],
    attitudes: Mapping[str, Mapping[str, str]],
    named: Sequence[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """Each combatant's stance from their own disposition toward the others (the operator, 2026-11-24:
    "Combat sides should be based on character disposition not blanket red team and blue team"): the
    chat's dispositions (the story's latest) over the wiki's current attitude, each read as a stance
    (contract stance_of). Returns (stances {id: {stance, hostile_to}}, the questions for those the fight line
    names, keyed disposition_<id>: the story may have turned them). Anyone with no stance is left to the VTT,
    which reads the wiki's rows and offers what it can't settle as open_choices. The party is friendly."""
    here = {str(one["id"]): str(one.get("name") or "") for one in people}
    party_ids = [one for one in (str(p) for p in party) if one in here]
    named_ids = {str(one) for one in named}
    stance_of: Mapping[str, str] = COMBAT["stance_of"]
    stances: dict[str, dict[str, Any]] = {}
    questions: dict[str, dict[str, Any]] = {}
    for who, name in here.items():
        toward: dict[str, str] = {}
        for source in (attitudes, chat_dispositions):
            regard = dict(source.get(who) or {})
            # The wiki's attitude toward the party as a whole ("party", 5bf4e75): toward each PC here, below any
            # pair of its own.
            party_word = str(regard.pop("party", "") or "")
            if party_word in stance_of:
                for pc in party_ids:
                    if pc != who:
                        toward.setdefault(pc, stance_of[party_word])
            for other, word in regard.items():
                if str(other) in here and str(other) != who and word in stance_of:
                    toward[str(other)] = stance_of[word]
        hostile_to = [other for other, stance in toward.items() if stance == "hostile"]
        if who in party_ids:
            stances[who] = {"stance": "friendly", "hostile_to": [one for one in hostile_to if one not in party_ids]}
            continue
        if toward:
            to_party = [toward[one] for one in party_ids if one in toward]
            stance = "hostile" if "hostile" in to_party else "friendly" if "friendly" in to_party else "neutral"
            stances[who] = {"stance": stance, "hostile_to": hostile_to}
        if who in named_ids:
            known = ", ".join(f"{toward[other]} toward {here[other]}" for other in toward)
            questions[f"disposition_{who}"] = {
                "type": "choice",
                "instructions": str(COMBAT["disposition_question"])
                .replace("{{name}}", name)
                .replace("{{known}}", str(COMBAT["disposition_known"]).replace("{{stances}}", known) if known else ""),
                "criteria": dict(COMBAT["stances"]),
            }
    return stances, questions


def answered_stances(
    stances: Mapping[str, Mapping[str, Any]],
    answers: Mapping[str, Any] | None,
    questions: Mapping[str, Any],
    party: Sequence[str],
) -> dict[str, dict[str, Any]]:
    """The stances with the decision model's answers in (one among the three stances only; any other answer
    leaves what was recorded, or nothing, so the VTT's own rule stands for them). Someone it turns hostile
    with no one recorded is hostile to the party."""
    found = {who: dict(stance) for who, stance in stances.items()}
    for key in questions:
        choice = ((answers or {}).get(key) or {}).get("choice")
        if choice not in COMBAT["stances"]:
            continue
        who = key.removeprefix("disposition_")
        hostile_to = list((found.get(who) or {}).get("hostile_to") or [])
        if choice == "hostile" and not hostile_to:
            hostile_to = [str(one) for one in party if str(one) != who]
        found[who] = {"stance": str(choice), "hostile_to": hostile_to if choice == "hostile" else []}
    return found


def open_questions(choices: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """The VTT's open choices (a stance it couldn't settle: {person_id, name, toward, toward_name, reason,
    options}), one question each, among the VTT's own options only. Keyed open_<n>."""
    questions: dict[str, dict[str, Any]] = {}
    for index, choice in enumerate(choices):
        options = [str(one) for one in choice.get("options") or [] if str(one) in COMBAT["stances"]]
        if not options or not choice.get("person_id"):
            continue
        questions[f"open_{index}"] = {
            "type": "choice",
            "instructions": str(COMBAT["open_question"])
            .replace("{{name}}", str(choice.get("name") or "they"))
            .replace("{{toward}}", str(choice.get("toward_name") or "the others"))
            .replace("{{reason}}", str(choice.get("reason") or "")),
            "criteria": {one: str(COMBAT["stances"][one]) for one in options},
        }
    return questions


def defaulted_choices(
    choices: Sequence[Mapping[str, Any]], party: Sequence[str], named: Sequence[str]
) -> dict[str, dict[str, str]]:
    """The VTT's open choices that are never the decision model's (live run, 2026-11-24: it made the party's own
    Tam hostile to the seat, and the ferryman hostile to Tam, when the line named only the creature attacked):
    a party member toward another party member is friendly; anyone the fight's line doesn't name is neutral,
    a bystander. Keyed open_<n> as open_questions keys them; the rest are asked."""
    members = {str(one) for one in party}
    in_line = {str(one) for one in named}
    preset: dict[str, dict[str, str]] = {}
    for index, choice in enumerate(choices):
        options = [str(one) for one in choice.get("options") or []]
        who = str(choice.get("person_id") or "")
        toward = str(choice.get("toward") or "")
        if who in members and toward in members and "friendly" in options:
            preset[f"open_{index}"] = {"choice": "friendly"}
        elif who not in in_line and "neutral" in options:
            preset[f"open_{index}"] = {"choice": "neutral"}
    return preset


def settled(
    choices: Sequence[Mapping[str, Any]],
    answers: Mapping[str, Any] | None,
    hostile_now: Mapping[str, Sequence[str]],
) -> list[dict[str, Any]]:
    """The set_disposition calls the answers make: {person_id, disposition, hostile_to}, hostile_to their
    present enemies with the one this choice is toward added (hostile) or taken out (otherwise)."""
    calls: list[dict[str, Any]] = []
    for index, choice in enumerate(choices):
        picked = ((answers or {}).get(f"open_{index}") or {}).get("choice")
        if picked not in [str(one) for one in choice.get("options") or []] or picked not in COMBAT["stances"]:
            continue
        who = str(choice["person_id"])
        toward = str(choice.get("toward") or "")
        enemies = [str(one) for one in hostile_now.get(who) or [] if str(one) != toward]
        if picked == "hostile" and toward:
            enemies.append(toward)
        calls.append({"person_id": who, "disposition": str(picked), "hostile_to": enemies})
    return calls
