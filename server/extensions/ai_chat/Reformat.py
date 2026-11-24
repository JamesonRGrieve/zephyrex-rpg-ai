# SPDX-License-Identifier: AGPL-3.0-or-later
"""Structure without trusting the narrator (the operator, 2026-11-23; contract reformat): the narrator's
finished prose rewritten by a small model as items whose speaker and target can only be someone present,
so who says and who does is a constrained model's call, never a pattern's.

The items are the structured turn's (Structured.py), read into runs by its structured_runs.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from difflib import SequenceMatcher
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.ActionLines import (  # type: ignore[import-not-found]
    antecedent,
    pronoun_of,
    short_names,
)
from zephyrex.extensions.ai_chat.Structured import STRUCTURED, turn_schema  # type: ignore[import-not-found]

REFORMAT: dict[str, Any] = CONTRACT["reformat"]


def reformat_schema(names: Sequence[str]) -> dict[str, Any]:
    """The structured turn's schema with speaker and target limited to the people present (or null)."""
    schema: dict[str, Any] = turn_schema()
    item = schema["properties"]["items"]["items"]
    who: dict[str, Any] = {"type": ["string", "null"], "enum": [*dict.fromkeys(names), None]}
    item["properties"]["speaker"] = {**who, "description": STRUCTURED["descriptions"]["speaker"]}
    item["properties"]["target"] = {**who, "description": STRUCTURED["descriptions"]["target"]}
    return schema


def reformat_request(
    model: str, prose: str, names: Sequence[str], note: str = "", who: Mapping[str, str] | None = None
) -> dict[str, Any]:
    """The reformat model's request: the instruction naming who may speak, each with who they are (``who``:
    name to a line about them, so a "her" isn't credited to a man: the operator's test-play, 2026-11-24, chat
    950d879c), the prose, the schema; on a retry, the requirements its last answer broke (``note``)."""
    described = [f"{name} ({(who or {})[name]})" if (who or {}).get(name) else name for name in dict.fromkeys(names)]
    listed = ", ".join(described) or "(no one: every item is narration)"
    instruction = str(REFORMAT["instruction"]).replace("{{names}}", listed)
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": f"{instruction} {note}".strip()},
            {"role": "user", "content": prose.strip()},
        ],
        "stream": False,
        "temperature": 0,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": STRUCTURED["schema_name"], "schema": reformat_schema(names), "strict": True},
        },
    }


def reformat_items(content: str, names: Sequence[str]) -> list[dict[str, Any]] | None:
    """The model's items in structured_runs' form ({fields, text, closed}), anyone not present made
    narration; None when the answer isn't items."""
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        return None
    items = parsed.get("items") if isinstance(parsed, Mapping) else None
    if not isinstance(items, list):
        return None
    present = {name.casefold() for name in names}
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, Mapping) or not isinstance(item.get("text"), str):
            continue
        kind = item.get("kind") if item.get("kind") in STRUCTURED["kinds"] else "narrate"
        speaker = item.get("speaker") if isinstance(item.get("speaker"), str) else None
        if speaker is not None and speaker.casefold() not in present:
            speaker = None
        target = item.get("target") if isinstance(item.get("target"), str) else None
        if target is not None and target.casefold() not in present:
            target = None
        if speaker is None:
            kind = "narrate"
        fields = {"kind": kind, "speaker": speaker, "target": target, "manner": item.get("manner")}
        out.append({"fields": fields, "text": item["text"], "closed": True})
    return out or None


#: Words only a speaker says of themselves: an "action" with them in it is speech (build60's live run,
#: 2026-11-24: "Bram Holloway I assume a woman would require payment…" saved as an action line).
_FIRST_PERSON = re.compile(r"\b(?:I|I'm|I've|I'll|I'd|me|my|mine|myself|we|we're|we've|us|our|ours)\b", re.IGNORECASE)
_QUOTE = re.compile(r"[\"\u201c][^\"\u201d]*[\"\u201d]?")


def _forms(person: Mapping[str, Any]) -> list[str]:
    names = [str(person["name"]), *short_names(str(person["name"])), *(str(one) for one in person.get("aliases") or [])]
    return [name.strip() for name in names if name.strip()]


def _names_in(text: str, person: Mapping[str, Any]) -> bool:
    return any(re.search(rf"\b{re.escape(name)}\b", text) for name in _forms(person))


def _similar(a: str, b: str) -> bool:
    """Near-identical names ("Delphine Halloway" and "Bram Holloway"): the whole names or the last names alike."""

    def alike(x: str, y: str) -> bool:
        return SequenceMatcher(None, x.casefold(), y.casefold()).ratio() >= float(REFORMAT["similar_names"])

    return alike(a, b) or alike(a.split()[-1], b.split()[-1])


def _found_at(prose: str, text: str, start: int) -> int:
    """Where an item's words are in the prose, from ``start`` on (else anywhere); -1 when they aren't."""
    words = re.findall(r"[\w']+", text)[:8]
    if not words:
        return -1
    pattern = re.compile(r"\W+".join(re.escape(word) for word in words), re.IGNORECASE)
    found = pattern.search(prose, start) or pattern.search(prose)
    return found.start() if found is not None else -1


def _quoted_at(prose: str, at: int) -> bool:
    head = prose[:at]
    return head.count('"') % 2 == 1 or head.count("\u201c") > head.count("\u201d")


def _paragraph(prose: str, at: int) -> str:
    starts = [0, *(found.end() for found in re.finditer(r"\n\s*\n", prose))]
    begin = max(start for start in starts if start <= at)
    end = prose.find("\n\n", begin)
    return prose[begin : end if end >= 0 else len(prose)]


def _last_at(text: str, person: Mapping[str, Any]) -> int:
    """Where a text last names a person, or -1."""
    return max(
        (found.start() for name in _forms(person) for found in re.finditer(rf"\b{re.escape(name)}\b", text)),
        default=-1,
    )


def _pronouns(text: str) -> set[str]:
    """The subject pronouns a text's pronouns are (his: he), its quotes left out."""
    actions = CONTRACT["action_lines"]
    words = re.findall(r"[a-z]+", text.lower())
    return {actions["possessive_openers"].get(word, word) for word in words} & set(actions["subject_pronouns"])


def _speaker(person: Mapping[str, Any], prose: str, at: int, people: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
    """Whose an item credited to ``person`` is, by the prose's own words (grounded). Names inside speech are
    whom it's said to, never who acts, so only the prose outside its quotes counts."""
    told = _QUOTE.sub(" ", _paragraph(prose, at) if at >= 0 else prose)
    named = [one for one in people if _names_in(told, one)]
    # A pronoun of the paragraph's that no one it names accounts for may mean them ("Delphine Halloway waits. He
    # clears his throat."): theirs stays.
    accounted = {pronoun_of(one) for one in named} - {None}
    loose = _pronouns(told) - accounted
    theirs = pronoun_of(person)
    if _names_in(told, person) or (theirs in loose if theirs is not None else bool(loose)):
        return person
    owner = named[0] if len(named) == 1 else None
    opener = re.match(r"\W*(\w+)", told)
    word = opener.group(1).lower() if opener is not None else ""
    actions = CONTRACT["action_lines"]
    pronoun = actions["possessive_openers"].get(word) or (word if word in actions["subject_pronouns"] else None)
    if not named and pronoun is not None:
        before = _QUOTE.sub(" ", prose[: max(at, 0)])
        mentioned = sorted((one for one in people if _last_at(before, one) >= 0), key=lambda one: _last_at(before, one))
        meant = antecedent(pronoun, [str(one["id"]) for one in mentioned], people, strict=word == "their")
        owner = next((one for one in people if str(one["id"]) == meant), None)
    if owner is not None:
        return owner
    if _names_in(_QUOTE.sub(" ", prose), person):
        return person
    alike = [
        one
        for one in people
        if one is not person and _names_in(prose, one) and _similar(str(one["name"]), str(person["name"]))
    ]
    return alike[0] if len(alike) == 1 else person


def _addressed(
    text: str, people: Sequence[Mapping[str, Any]], speaker: Mapping[str, Any] | None
) -> Mapping[str, Any] | None:
    """Whom a line of speech calls by name ("Mr. Ashford, my husband is many things"): a name, or a title and a
    name, at its start or its end, set off by a comma."""
    for one in people:
        if one is speaker:
            continue
        for name in _forms(one):
            called = rf"(?:[A-Z][\w']*\.?\s+)?{re.escape(name)}"
            if re.match(rf"\W*{called}\s*[,!?]", text) or re.search(rf",\s*{called}\W*$", text):
                return one
    return None


def _aimed(
    fields: Mapping[str, Any],
    text: str,
    told: str,
    people: Sequence[Mapping[str, Any]],
    asker: Mapping[str, Any] | None,
) -> str | None:
    """Whom a line is aimed at, by the prose's own words (build60's live run, 2026-11-24, chat d219ba90: Delphine
    Halloway's answer to Quentin Ashford's question saved as said to Bram Holloway, and "(at Bram Holloway)
    pauses, reconsidering"). Speech: whom it calls by name; else the formatter's target when the line's
    paragraph names them outside its quotes; else whoever the reply answers. An action: the formatter's target
    only when the action names them, or a pronoun of it can mean them."""
    by_name = {str(one["name"]).casefold(): one for one in people}
    speaker = by_name.get(str(fields.get("speaker") or "").casefold())
    target = by_name.get(str(fields.get("target") or "").casefold())
    if fields.get("kind") == "say":
        called = _addressed(text, people, speaker)
        if called is not None:
            return str(called["name"])
        if target is None or target is speaker:
            return None
        if _names_in(told, target):
            return str(target["name"])
        return str(asker["name"]) if asker is not None and asker is not speaker else None
    if fields.get("kind") != "do" or target is None or target is speaker:
        return None
    words = set(re.findall(r"[a-z]+", text.lower()))
    fits = pronoun_of(target)
    # A pronoun the actor's own could be ("folds her hands") never aims it.
    own = pronoun_of(speaker) if speaker is not None else None
    words_of = CONTRACT["action_lines"]["pronoun_words"]
    objects = set(words_of.get(fits, [])) - {fits} if fits and fits != own else set()
    return str(target["name"]) if _names_in(text, target) or words & objects else None


def _rejoined(items: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """A quote a speech tag cuts at its comma ("Romantic liaison," she repeats, "is...") one say line again, the
    tag's action after it (build60's live run, 2026-11-24, chat d219ba90: "Romantic liaison," saved alone)."""
    out: list[dict[str, Any]] = []
    for item in items:
        fields = item["fields"]
        speaker = fields.get("speaker")
        # The last say, with at most one line after it.
        says = [at for at in (len(out) - 1, len(out) - 2) if at >= 0 and out[at]["fields"].get("kind") == "say"]
        back = says[0] if says else None
        first = str(out[back]["text"]).rstrip().rstrip('"\u201d').rstrip() if back is not None else ""
        if (
            fields.get("kind") == "say"
            and speaker
            and back is not None
            and out[back]["fields"].get("speaker") == speaker
            and first.endswith(",")
            and all(one["fields"].get("speaker") in (speaker, None) for one in out[back + 1 :])
        ):
            second = str(item["text"]).strip()
            joined = f"{first} {second}" if second[:1].islower() else f"{first[:-1]}. {second}"
            out[back] = {**out[back], "text": joined}
            continue
        out.append(item)
    return out


def grounded(
    items: Sequence[Mapping[str, Any]],
    prose: str,
    people: Sequence[Mapping[str, Any]],
    asker: str | None = None,
) -> list[dict[str, Any]]:
    """The formatter's items held to the prose they came from (build60's live run, 2026-11-24, chat d219ba90:
    Delphine Halloway's speech credited to Bram Holloway, as action lines):

    - an item quoted in the prose, or with a speaker's own words in it (I, my, we...), is speech;
    - an item is the speaker's the prose's own words make it: when its paragraph, outside its quotes, names
      one present person (or, naming no one, opens on a pronoun meaning one: ActionLines.antecedent) and
      not the credited one, it's theirs; when the credited one is never named in the prose and someone with
      a near-identical name is, it's theirs;
    - whom it's aimed at is whom the prose says (_aimed: ``asker`` is whose line the reply answers);
    - a quote cut by its speech tag is one line (_rejoined)."""
    by_name = {str(one["name"]).casefold(): one for one in people}
    asked = by_name.get(str(asker or "").casefold())
    out: list[dict[str, Any]] = []
    cursor = 0
    for item in items:
        fields = dict(item["fields"])
        text = str(item["text"])
        at = _found_at(prose, text, cursor)
        cursor = at + 1 if at >= 0 else cursor
        person = by_name.get(str(fields.get("speaker") or "").casefold())
        if person is not None and fields.get("kind") != "say":
            if (at >= 0 and _quoted_at(prose, at)) or _FIRST_PERSON.search(_QUOTE.sub(" ", text) or text):
                fields = {**fields, "kind": "say", "manner": fields.get("manner") or "speak"}
        if person is not None:
            person = _speaker(person, prose, at, people)
            fields = {**fields, "speaker": str(person["name"])}
            told = _QUOTE.sub(" ", _paragraph(prose, at) if at >= 0 else prose)
            fields = {**fields, "target": _aimed(fields, text, told, people, asked)}
        out.append({**item, "fields": fields})
    return _rejoined(out)


def _words(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.casefold())


def faithful(prose: str, items: Sequence[Mapping[str, Any]]) -> bool:
    """Whether the items are the prose re-sorted, not rewritten: nearly every word of it kept
    (min_kept) and almost none added (max_added)."""
    had = _words(prose)
    got = _words(" ".join(str(item["text"]) for item in items))
    if not had:
        return False
    pool = {word: had.count(word) for word in set(had)}
    kept = 0
    for word in got:
        if pool.get(word, 0) > 0:
            pool[word] -= 1
            kept += 1
    return kept / len(had) >= float(REFORMAT["min_kept"]) and (len(got) - kept) / len(had) <= float(
        REFORMAT["max_added"]
    )


def rendered_runs(runs: Sequence[Mapping[str, Any]]) -> str:
    """The reformatted runs as the decision model reads them: one line each, who, what kind, how and to whom."""
    shown: list[str] = []
    for run in runs:
        who = str(run.get("speaker_name") or ("the narrator" if run.get("speaker_id") is None else "someone"))
        for line in run.get("lines") or []:
            kind = str(line.get("kind") or "narrate")
            how = ", ".join(
                one
                for one in [
                    str(line.get("manner") or "") if kind == "say" else "",
                    f"to {line.get('target_name') or line.get('target_id')}"
                    if line.get("target_name") or line.get("target_id")
                    else "",
                ]
                if one
            )
            text = f'"{line.get("text")}"' if kind == "say" else str(line.get("text") or "")
            shown.append(f"[{kind}] {who}{f' ({how})' if how else ''}: {text}")
    return "\n".join(shown)


def narration_about(runs: Sequence[Mapping[str, Any]], people: Sequence[Mapping[str, Any]]) -> list[str]:
    """The narration sentences that name a present person or open with a subject pronoun: the ones an action
    might hide in, each checked on its own (the operator, 2026-11-24)."""
    pronouns = ("he ", "she ", "they ")
    found: list[str] = []
    for run in runs:
        if run.get("speaker_id") is not None:
            continue
        for line in run.get("lines") or []:
            for sentence in re.split(r"(?<=[.!?])\s+", str(line.get("text") or "")):
                said = sentence.strip()
                lowered = said.lower()
                named = any(str(one["name"]).split()[0].lower() in lowered for one in people if str(one["name"]))
                if said and (named or lowered.startswith(pronouns)):
                    found.append(said)
    return found


def check_questions(
    runs: Sequence[Mapping[str, Any]] = (), people: Sequence[Mapping[str, Any]] = ()
) -> dict[str, dict[str, Any]]:
    """The format requirements, one question each (contract reformat checks), met or not; and each
    narration sentence about a present person, asked on its own whether it's an action (citing it)."""
    questions = {
        f"format_{key}": {
            "type": "choice",
            "instructions": str(REFORMAT["check_instructions"]).replace("{{requirement}}", str(requirement)),
            "criteria": dict(REFORMAT["check_options"]),
        }
        for key, requirement in REFORMAT["checks"].items()
    }
    for index, sentence in enumerate(narration_about(runs, people)):
        questions[f"action_{index}"] = {
            "type": "choice",
            "instructions": str(REFORMAT["action_check"]).replace("{{sentence}}", sentence),
            "criteria": dict(REFORMAT["action_options"]),
        }
    return questions


def failed_checks(
    answers: Mapping[str, Any] | None,
    runs: Sequence[Mapping[str, Any]] = (),
    people: Sequence[Mapping[str, Any]] = (),
) -> list[str]:
    """The requirements the decision model says the lines break, in the contract's words; and each sentence
    it says is an action, cited."""
    failed = [
        str(requirement)
        for key, requirement in REFORMAT["checks"].items()
        if ((answers or {}).get(f"format_{key}") or {}).get("choice") == "fails"
    ]
    actions = [
        sentence
        for index, sentence in enumerate(narration_about(runs, people))
        if ((answers or {}).get(f"action_{index}") or {}).get("choice") == "an action"
    ]
    if actions:
        failed.append(str(REFORMAT["action_note"]).replace("{{sentences}}", " | ".join(actions)))
    return failed
