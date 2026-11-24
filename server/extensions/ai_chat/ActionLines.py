# SPDX-License-Identifier: AGPL-3.0-or-later
"""Every action of a present person is an action line, in present tense, with them as its subject: by
construction, never left to a model (the operator, 2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING
ACTIONS? She rose from her seat without proper tense/phrasing and without an action block.").

After the formatter: a narration sentence whose subject is a present person (by name, or a subject pronoun
meaning the nearest one named before it) becomes that person's action line; an action line's own subject
is taken off (the stored form puts the actor's name first) and its first verb put in the present. A sentence
opening on a present person's possessive ("Delphine Halloway's spine stiffens", "Her gaze sweeps across the
room") is their action too, kept as ``'s spine stiffens`` (stored ``Delphine Halloway's spine stiffens``):
build60's live run, 2026-11-24, "she set down her cup and it wasn't action tagged". A pronoun means the
nearest person named whose own pronoun doesn't say otherwise. Held to contract/action-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

ACTIONS: dict[str, Any] = CONTRACT["action_lines"]
# A sentence ends at . ! or ?, or one with a closing quote after it, before the next one opens.
_BOUNDARY = re.compile(r"(?:(?<=[.!?])|(?<=[.!?][\"”]))\s+(?=[\"“(A-Z])")
_QUOTED = re.compile(r"[\"“]([^\"”]*)[\"”]?")
_VOWELS = "aeiou"


def sentences(text: str) -> list[str]:
    """A text's sentences, never split inside quoted speech (live run, build58: Hesk's "...what they owe. That
    miller's got himself into..." split at "That", a world opener, and half his speech went to the narrator)."""
    found: list[str] = []
    start = 0
    for boundary in _BOUNDARY.finditer(text):
        head = text[: boundary.start()]
        if head.count('"') % 2 == 1 or head.count("“") > head.count("”"):
            continue
        found.append(text[start : boundary.start()])
        start = boundary.end()
    found.append(text[start:])
    return [one for one in found if one.strip()]


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


def short_names(name: str) -> list[str]:
    """What a person may be called besides their whole name: their first name and their last, never a title
    ("Old Hesk" is Hesk, never Old; "Inspector Mira Kettle" is Mira or Kettle)."""
    words = [word for word in name.split() if word.lower() not in ACTIONS["titles"]]
    return list(dict.fromkeys([*words[:1], *words[-1:]])) if len(name.split()) > 1 else []


def pronoun_of(person: Mapping[str, Any]) -> str | None:
    """A person's own pronoun: the one they carry ("pronoun"), else the one their description uses most
    (contract action_lines.pronoun_words); None when neither says."""
    said = person.get("pronoun")
    if said in ACTIONS["subject_pronouns"]:
        return str(said)
    words = re.findall(r"[a-z]+", str(person.get("description") or person.get("summary") or "").lower())
    counts = {pronoun: sum(word in forms for word in words) for pronoun, forms in ACTIONS["pronoun_words"].items()}
    ranked = sorted(counts.items(), key=lambda one: -one[1])
    if not ranked or ranked[0][1] == 0 or (len(ranked) > 1 and ranked[0][1] == ranked[1][1]):
        return None
    return str(ranked[0][0])


def antecedent(
    pronoun: str, recent: Sequence[str], people: Sequence[Mapping[str, Any]], strict: bool = False
) -> str | None:
    """Who a pronoun means: the nearest of ``recent`` (most recent last) whose own pronoun is it, or unknown
    (never when ``strict``: "their" is a group's unless the person is "they"); None when no one fits ("Her
    knuckles" after Bram Holloway's action is no action of his)."""
    by_id = {str(one["id"]): one for one in people}
    for id_ in reversed(recent):
        theirs = pronoun_of(by_id.get(id_) or {})
        if theirs == pronoun or (theirs is None and not strict):
            return id_
    return None


def _who(sentence: str, people: Sequence[Mapping[str, Any]], recent: Sequence[str]) -> tuple[str | None, str, bool]:
    """Whose action a sentence is, its words after the subject, and whether the subject is a possessive: a
    present person's name (whole, first name or alias) opening it, or a pronoun meaning one of ``recent``
    (antecedent). A possessive's words keep it ("'s spine stiffens"). (None, sentence, False) when neither."""
    stripped = sentence.lstrip()
    for person in sorted(people, key=lambda one: -len(str(one["name"]))):
        names = [str(person["name"]), *(str(alias) for alias in person.get("aliases") or [])]
        names += short_names(str(person["name"]))
        for name in sorted({one.strip() for one in names if one.strip()}, key=len, reverse=True):
            match = re.match(rf"{re.escape(name)}(['\u2019]s\b)?\s+(.*)", stripped, re.DOTALL)
            if match is not None:
                owned = match.group(1) is not None
                return str(person["id"]), f"'s {match.group(2)}" if owned else match.group(2), owned
    first = re.match(r"(\w+)\s+(.*)", stripped, re.DOTALL)
    word = first.group(1).lower() if first is not None else ""
    if first is not None and word in ACTIONS["subject_pronouns"]:
        found = antecedent(word, recent, people)
        if found is not None:
            return found, first.group(2), False
    if first is not None and word in ACTIONS["possessive_openers"]:
        found = antecedent(ACTIONS["possessive_openers"][word], recent, people, strict=word == "their")
        if found is not None:
            return found, f"'s {first.group(2)}", True
    return None, sentence, False


def _opens_on_world(sentence: str) -> bool:
    """Whether a sentence opens on the world, not a person (contract action_lines.world_openers)."""
    first = re.match(r"\W*(\w+)", sentence)
    return first is not None and first.group(1).lower() in ACTIONS["world_openers"]


def _possessed(sentence: str, people: Sequence[Mapping[str, Any]]) -> bool:
    """Whether a sentence opens on a possessive ("Old Hesk's weathered face tightens", "His gaze lingers..."):
    asked only when no one present it could mean was found (_who), when it is narration."""
    stripped = sentence.lstrip()
    first = re.match(r"\W*(\w+)", stripped)
    if first is not None and first.group(1).lower() in ACTIONS["possessive_openers"]:
        return True
    for person in people:
        for name in [str(person["name"]), *short_names(str(person["name"])), *(person.get("aliases") or [])]:
            if name.strip() and stripped.startswith(f"{name.strip()}'s"):
                return True
    return False


def _own_words(
    line: Mapping[str, Any], sentence: str, speaker: str, people: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]] | None:
    """A character's own sentence with no person as its subject, as their lines: a quote-led one is their
    speech, and a tag after it with them as subject ("...," he mutters) their action; None when it opens on
    the world or a possessive of no one present (narration). Their plain words are their speech, as their
    plain reply is: never "Narrator:" in their own message (live run, build58)."""
    if _opens_on_world(sentence) or _possessed(sentence, people):
        return None
    said = {**line, "speaker_id": speaker, "kind": "say", "manner": line.get("manner") or None}
    if not sentence.lstrip().startswith(('"', "“")):
        return [{**said, "text": sentence.strip()}]
    quoted = " ".join(part.strip() for part in _QUOTED.findall(sentence) if part.strip()).rstrip(",;: ")
    tail = _QUOTED.sub("", sentence).strip(" ,;:")
    lines = [{**said, "text": quoted}] if quoted else []
    if not tail:
        return lines
    actor, rest, owned = _who(tail, people, [speaker])
    if actor != speaker or not re.match(r"[\w']", rest):
        return None
    blank = {"manner": None, "target_id": None, "target_name": None}
    return [*lines, {**blank, "speaker_id": speaker, "kind": "do", "text": rest if owned else _action(rest)}]


def _action(rest: str) -> str:
    """An action's words with its first verb in the present: "rose from her seat." rises from her seat."""
    first = re.match(r"(\w+)(.*)", rest, re.DOTALL)
    return f"{present(first.group(1))}{first.group(2)}" if first is not None else rest


def _named(text: str, people: Sequence[Mapping[str, Any]]) -> str | None:
    """The last present person a text names, or None."""
    at, found = -1, None
    for person in people:
        for name in [str(person["name"]), *short_names(str(person["name"])), *(person.get("aliases") or [])]:
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
    # Who a pronoun may mean, the most recent last.
    recent: list[str] = []
    for run in runs:
        # In a character's own run, "he" or "she" first means that character.
        if run.get("speaker_id") is not None:
            recent.append(str(run["speaker_id"]))
        for line in run.get("lines") or []:
            kind = line.get("kind")
            text = str(line.get("text") or "")
            speaker = run.get("speaker_id")
            if kind == "narrate" or speaker is None:
                for sentence in sentences(text):
                    actor, rest, owned = _who(sentence, people, recent)
                    if actor is None or not (owned or re.match(r"\w", rest)) or rest[:1] in ('"', "\u201c"):
                        # In a character's own run, a sentence without a person as subject is their words unless it
                        # opens on the world ("The ferry bumps...", live run 2026-11-24) or a possessive: then it's
                        # narration.
                        own = None if speaker is None else _own_words(line, sentence, str(speaker), people)
                        if own is not None:
                            lines.extend(own)
                            continue
                        if speaker is not None:
                            wrong.append(sentence.strip())
                        lines.append({**line, "speaker_id": None, "kind": "narrate", "text": sentence})
                        mentioned = _named(sentence, people)
                        if mentioned is not None:
                            recent.append(mentioned)
                        continue
                    wrong.append(sentence.strip())
                    lines.append(
                        {
                            "speaker_id": actor,
                            "kind": "do",
                            "manner": None,
                            "target_id": None,
                            "target_name": None,
                            "text": rest if owned else _action(rest),
                        }
                    )
                    recent.append(actor)
                continue
            if kind == "do":
                # A sentence of it that opens on the world ("The ferry bumps against the post", live run 2026-11-24,
                # in Old Hesk's own turn) is narration, never the actor's action; the rest stay one action line.
                own_part: list[str] = []
                for sentence in sentences(text) or [text]:
                    actor, rest, owned = _who(sentence, people, [*recent, str(speaker)])
                    if owned and actor is not None:
                        # "Old Hesk's weathered face tightens" in his own turn: his action, as Old Hesk's ...
                        if own_part:
                            lines.append(_own_line(line, speaker, " ".join(own_part), people, names, wrong))
                            own_part = []
                        wrong.append(f"{names.get(str(speaker), '')} {sentence}".strip())
                        lines.append({**line, "speaker_id": actor, "kind": "do", "text": rest})
                        continue
                    world = _opens_on_world(sentence) and actor is None
                    if world or _possessed(sentence, people):
                        if own_part:
                            lines.append(_own_line(line, speaker, " ".join(own_part), people, names, wrong))
                            own_part = []
                        wrong.append(f"{names.get(str(speaker), '')} {sentence}".strip())
                        lines.append({**line, "speaker_id": None, "kind": "narrate", "text": sentence})
                    else:
                        own_part.append(sentence)
                if own_part:
                    lines.append(_own_line(line, speaker, " ".join(own_part), people, names, wrong))
            else:
                lines.append({**line, "speaker_id": speaker})
            recent.append(str(speaker))
    return _grouped(lines, names), wrong


def _own_line(
    line: Mapping[str, Any],
    speaker: Any,
    text: str,
    people: Sequence[Mapping[str, Any]],
    names: Mapping[str, str],
    wrong: list[str],
) -> dict[str, Any]:
    """An action line of the speaker's, its own subject taken off and its first verb in the present."""
    actor, rest, _owned = _who(text, people, [str(speaker)])
    fixed = _action(rest if actor == str(speaker) else text)
    if fixed != text:
        wrong.append(f"{names.get(str(speaker), '')} {text}".strip())
    return {**line, "speaker_id": speaker, "text": fixed}


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
