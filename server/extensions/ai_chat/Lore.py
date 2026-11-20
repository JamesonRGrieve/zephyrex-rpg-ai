# SPDX-License-Identifier: AGPL-3.0-or-later
"""Which lorebook (World Info) entries a reply gets, and where they go: the server's twin of the
client's activateLore (client/src/features/lore/activate.ts), held to the same cases
(contract/lore-cases.json, run by Lore_test.py and by the client's suite).

1. Eligible: enabled, the character filter passes, ``delay`` messages have been written, and not
   cooling down. An entry still inside its ``sticky`` window is active whatever the text says.
2. Matched against the last ``scan_depth`` story messages: a constant always; otherwise any
   primary key, then the secondary keys by ``selective_logic``. A key is a substring (case and
   whole words by the entry, else the settings) or a ``/regex/flags``.
3. Recursion: newly activated entries' content (unless ``prevent_recursion``) is scanned again,
   up to ``recursion_steps`` times; ``exclude_recursion`` entries are never activated that way, and
   ``delay_until_recursion`` entries only that way.
4. Probability, then inclusion groups (a prioritized member wins outright, else a weighted pick),
   with the draws supplied by the caller in a fixed order.
5. The token budget keeps the highest-order entries that fit.
6. Timed effects: a fresh sticky entry stays ``sticky`` messages; an entry with ``cooldown`` rests
   that long once it (or its sticky window) ends.
"""

import math
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import PROMPT  # type: ignore[import-not-found]

REGEX_KEY = re.compile(r"^/(.+)/([a-z]*)$", re.DOTALL)
Rolls = Callable[[], float]


@dataclass
class LoreResult:
    active: list[str]
    sections: dict[str, str]
    at_depth: list[dict[str, Any]]
    state: dict[str, dict[str, int]] = field(default_factory=dict)


def lore_tokens(text: str) -> int:
    return math.ceil(len(text) / PROMPT["characters_per_token"])


def _key_matches(key: str, text: str, case_sensitive: bool, whole_words: bool) -> bool:
    regex = REGEX_KEY.match(key)
    if regex is not None:
        flags = re.IGNORECASE if "i" in regex.group(2) else 0
        try:
            return re.search(regex.group(1), text, flags) is not None
        except re.error:
            return False
    if not key:
        return False
    if whole_words:
        pattern = rf"(?<!\w){re.escape(key)}(?!\w)"
        return re.search(pattern, text, 0 if case_sensitive else re.IGNORECASE) is not None
    return key in text if case_sensitive else key.lower() in text.lower()


def _matches(entry: Mapping[str, Any], text: str, settings: Mapping[str, Any]) -> bool:
    if entry["constant"]:
        return True
    case = settings["case_sensitive"] if entry["case_sensitive"] is None else entry["case_sensitive"]
    words = settings["match_whole_words"] if entry["match_whole_words"] is None else entry["match_whole_words"]

    def hit(key: str) -> bool:
        return _key_matches(key, text, case, words)

    if not any(hit(key) for key in entry["keys"]):
        return False
    secondary = entry["secondary_keys"]
    if not secondary:
        return True
    hits = [hit(key) for key in secondary]
    logic = entry["selective_logic"]
    if logic == "and_any":
        return any(hits)
    if logic == "and_all":
        return all(hits)
    if logic == "not_any":
        return not any(hits)
    return not all(hits)  # not_all


def _ranked(entries: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(entries, key=lambda entry: (entry["order"], entry["id"]))


def activate_lore(
    entries: Sequence[Mapping[str, Any]],
    history: Sequence[str],
    message_count: int,
    speaker: str,
    state: Mapping[str, Mapping[str, int]],
    settings: Mapping[str, Any],
    roll: Rolls,
) -> LoreResult:
    def eligible(entry: Mapping[str, Any]) -> bool:
        if not entry["enabled"]:
            return False
        names = entry["character_names"]
        if names and (speaker in names) == entry["character_exclude"]:
            return False
        if message_count < entry["delay"]:
            return False
        timed = state.get(entry["id"], {})
        return int(timed.get("cooldown_until", 0)) <= message_count

    def held(entry: Mapping[str, Any]) -> bool:
        return int(state.get(entry["id"], {}).get("sticky_until", 0)) > message_count

    candidates = [entry for entry in _ranked(entries) if eligible(entry)]
    sticky_held = {entry["id"] for entry in candidates if held(entry)}
    depth = settings["scan_depth"]
    buffer = "\n".join(history[-depth:]) if depth > 0 else ""

    activated: dict[str, Mapping[str, Any]] = {}
    fresh: list[Mapping[str, Any]] = []
    for entry in candidates:
        if entry["id"] in sticky_held or (not entry["delay_until_recursion"] and _matches(entry, buffer, settings)):
            activated[entry["id"]] = entry
            fresh.append(entry)
    for _step in range(settings["recursion_steps"]):
        text = "\n".join(entry["content"] for entry in fresh if not entry["prevent_recursion"])
        if not text:
            break
        fresh = [
            entry
            for entry in candidates
            if entry["id"] not in activated and not entry["exclude_recursion"] and _matches(entry, text, settings)
        ]
        if not fresh:
            break
        for entry in fresh:
            activated[entry["id"]] = entry

    # Probability: one draw per uncertain entry, in order.
    kept = []
    for entry in _ranked(list(activated.values())):
        if entry["id"] not in sticky_held and entry["probability"] < 100 and roll() >= entry["probability"] / 100:
            continue
        kept.append(entry)

    # Inclusion groups: one member each.
    groups: dict[str, list[Mapping[str, Any]]] = {}
    for entry in kept:
        if entry["group"]:
            groups.setdefault(entry["group"], []).append(entry)
    dropped: set[str] = set()
    for name in sorted(groups):
        members = groups[name]
        if len(members) < 2:
            continue
        prioritized = [member for member in members if member["prioritize"]]
        if prioritized:
            winner = sorted(prioritized, key=lambda member: (-member["order"], member["id"]))[0]
        else:
            total = sum(member["group_weight"] for member in members)
            draw = roll() * total
            winner = members[-1]
            running = 0.0
            for member in members:
                running += member["group_weight"]
                if draw < running:
                    winner = member
                    break
        dropped |= {member["id"] for member in members if member["id"] != winner["id"]}
    kept = [entry for entry in kept if entry["id"] not in dropped]

    # Budget: the highest-order entries that fit.
    budget = settings["token_budget"]
    used = 0
    fitted = []
    for entry in sorted(kept, key=lambda entry: (-entry["order"], entry["id"])):
        cost = lore_tokens(entry["content"])
        if used + cost > budget:
            continue
        used += cost
        fitted.append(entry)
    final = _ranked(fitted)

    sections: dict[str, str] = {}
    depths: dict[tuple[int, str], list[str]] = {}
    for entry in final:
        if entry["position"] == "at_depth":
            depths.setdefault((entry["depth"], entry["role"]), []).append(entry["content"])
        else:
            existing = sections.get(entry["position"])
            sections[entry["position"]] = entry["content"] if existing is None else f"{existing}\n{entry['content']}"
    at_depth = [
        {"depth": depth_value, "role": role, "content": "\n".join(contents)}
        for (depth_value, role), contents in sorted(depths.items(), key=lambda item: (-item[0][0], item[0][1]))
    ]

    new_state = {key: dict(value) for key, value in state.items()}
    for entry in final:
        timed = new_state.get(entry["id"], {"sticky_until": 0, "cooldown_until": 0})
        if entry["id"] in sticky_held:
            continue
        if entry["sticky"] > 0:
            timed = {"sticky_until": message_count + entry["sticky"], "cooldown_until": 0}
        elif entry["cooldown"] > 0:
            timed = {"sticky_until": 0, "cooldown_until": message_count + entry["cooldown"]}
        else:
            continue
        new_state[entry["id"]] = timed
    # A sticky window that has ended starts its entry's cooldown.
    by_id = {entry["id"]: entry for entry in entries}
    for entry_id, timed in new_state.items():
        entry = by_id.get(entry_id)
        if entry is None:
            continue
        ended = 0 < timed.get("sticky_until", 0) <= message_count
        if ended and entry["cooldown"] > 0 and timed.get("cooldown_until", 0) <= message_count:
            new_state[entry_id] = {"sticky_until": 0, "cooldown_until": timed["sticky_until"] + entry["cooldown"]}

    return LoreResult(active=sorted(entry["id"] for entry in final), sections=sections, at_depth=at_depth, state=new_state)
