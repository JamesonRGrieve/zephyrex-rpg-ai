# SPDX-License-Identifier: AGPL-3.0-or-later
"""Every action of a present person is an action line, in present tense, with them as its subject: by
construction, never left to a model (the operator, 2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING
ACTIONS? She rose from her seat without proper tense/phrasing and without an action block.").

After the formatter: a narration sentence whose subject is a present person (by name, or a subject pronoun
meaning the nearest one named before it) becomes that person's action line; an action line's own subject
is taken off (the stored form puts the actor's name first) and its first verb put in the present. Held to
contract/action-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

ACTIONS: dict[str, Any] = CONTRACT["action_lines"]
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[\"“(A-Z])")
_VOWELS = "aeiou"


def present(verb: str) -> str:
    """A past-tense verb in the present, third person ("rose" rises, "walked" walks, "nodded" nods); a verb
    already in the present, or not a verb it knows, as it is."""
    word = verb.lower()
    irregular: Mapping[str, str] = ACTIONS["irregular"]
    if word in irregular:
        found = irregular[word]
    elif len(word) > 3 and word.endswith("ied"):
        found = word[:-3] + "ies"
    elif len(word) > 3 and word.endswith("ed"):
        base = word[:-2]
        if len(base) > 2 and base[-1] == base[-2] and base[-1] not in "ls" + _VOWELS:
            base = base[:-1]  # nodded: nod
        elif _syllables(base) == 1 and _cvc(base):
            base += "e"  # smiled: smile; hoped: hope
        found = base + ("es" if base.endswith(("s", "sh", "ch", "x", "z", "o")) else "s")
    else:
        return verb
    return found[:1].upper() + found[1:] if verb[:1].isupper() else found


def _syllables(word: str) -> int:
    return len(re.findall(r"[aeiouy]+", word))


def _cvc(word: str) -> bool:
    return len(word) >= 3 and word[-1] not in _VOWELS + "wxy" and word[-2] in _VOWELS and word[-3] not in _VOWELS


def _who(sentence: str, people: Sequence[Mapping[str, Any]], last: str | None) -> tuple[str | None, str]:
    """Whose action a sentence is, and its words after the subject: a present person's name (whole, first
    name or alias) opening it, or a subject pronoun meaning ``last``; (None, sentence) when neither."""
    stripped = sentence.lstrip()
    for person in sorted(people, key=lambda one: -len(str(one["name"]))):
        names = [str(person["name"]), *(str(alias) for alias in person.get("aliases") or [])]
        names += [str(person["name"]).split()[0]] if " " in str(person["name"]) else []
        for name in sorted({one.strip() for one in names if one.strip()}, key=len, reverse=True):
            match = re.match(rf"{re.escape(name)}(?:'s)?\b\s+(.*)", stripped, re.DOTALL)
            if match is not None and not stripped[len(name) :].startswith("'s"):
                return str(person["id"]), match.group(1)
    pronoun = re.match(r"(\w+)\s+(.*)", stripped, re.DOTALL)
    if pronoun is not None and pronoun.group(1).lower() in ACTIONS["subject_pronouns"] and last is not None:
        return last, pronoun.group(2)
    return None, sentence


def _action(rest: str) -> str:
    """An action's words with its first verb in the present: "rose from her seat." rises from her seat."""
    first = re.match(r"(\w+)(.*)", rest, re.DOTALL)
    return f"{present(first.group(1))}{first.group(2)}" if first is not None else rest


def _named(text: str, people: Sequence[Mapping[str, Any]]) -> str | None:
    """The last present person a text names, or None."""
    at, found = -1, None
    for person in people:
        for name in [str(person["name"]), str(person["name"]).split()[0], *(person.get("aliases") or [])]:
            for match in re.finditer(rf"\b{re.escape(str(name))}\b", text):
                if match.start() > at:
                    at, found = match.start(), str(person["id"])
    return found


def action_lines(
    runs: Sequence[Mapping[str, Any]], people: Sequence[Mapping[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """The runs with every present person's action an action line of theirs, in present tense, and the
    sentences that weren't (for the formatter's second try). Speech is left as it is."""
    names = {str(one["id"]): str(one["name"]) for one in people}
    lines: list[dict[str, Any]] = []
    wrong: list[str] = []
    last: str | None = None
    for run in runs:
        for line in run.get("lines") or []:
            kind = line.get("kind")
            text = str(line.get("text") or "")
            speaker = run.get("speaker_id")
            if kind == "narrate" or speaker is None:
                for sentence in [one for one in _SENTENCE.split(text) if one.strip()]:
                    actor, rest = _who(sentence, people, last)
                    if actor is None or not re.match(r"\w", rest) or rest[:1] in ('"', "\u201c"):
                        lines.append({**line, "speaker_id": None, "kind": "narrate", "text": sentence})
                        last = _named(sentence, people) or last
                        continue
                    wrong.append(sentence.strip())
                    lines.append(
                        {
                            "speaker_id": actor,
                            "kind": "do",
                            "manner": None,
                            "target_id": None,
                            "target_name": None,
                            "text": _action(rest),
                        }
                    )
                    last = actor
                continue
            if kind == "do":
                actor, rest = _who(text, people, str(speaker))
                own = rest if actor == str(speaker) else text
                fixed = _action(own)
                if fixed != text:
                    wrong.append(f"{names.get(str(speaker), '')} {text}".strip())
                lines.append({**line, "speaker_id": speaker, "text": fixed})
            else:
                lines.append({**line, "speaker_id": speaker})
            last = str(speaker)
    return _grouped(lines, names), wrong


def _grouped(lines: Sequence[Mapping[str, Any]], names: Mapping[str, str]) -> list[dict[str, Any]]:
    """Lines into runs again: one per stretch of the same speaker (the narrator's sentences one paragraph)."""
    runs: list[dict[str, Any]] = []
    for line in lines:
        speaker = line.get("speaker_id")
        if speaker is None and runs and runs[-1]["speaker_id"] is None and runs[-1]["lines"]:
            previous = runs[-1]["lines"][-1]
            runs[-1]["lines"][-1] = {**previous, "text": f"{previous['text']} {line['text']}".strip()}
            continue
        if runs and runs[-1]["speaker_id"] == speaker:
            runs[-1]["lines"].append(dict(line))
            continue
        runs.append(
            {
                "speaker_id": speaker,
                "speaker_name": names.get(str(speaker)) if speaker is not None else None,
                "lines": [dict(line)],
            }
        )
    return runs
