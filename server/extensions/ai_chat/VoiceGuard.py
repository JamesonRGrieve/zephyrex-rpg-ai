# SPDX-License-Identifier: AGPL-3.0-or-later
"""The narrator's interludes and the free-text check (the operator, 2026-11-21): the narrator may voice
any cast member but the person's seat, only in an interlude (a line ``@@Name``, their words and actions,
then ``@@Narrator``). narrate_segments splits a narration into its parts, the seat's name cutting it
there; speaks_for and stranger_in are text matches, no model call.

The twin of client/src/features/chat/voiceGuard.ts, held to contract/voice-guard-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT, PROMPT  # type: ignore[import-not-found]

VOICE_GUARD: dict[str, Any] = CONTRACT["voice_guard"]
_SENTENCE = re.compile(r"[^.!?]*(?:[.!?]+[\"”’']?(?=\s|$))?")  # noqa: RUF001


def _word(text: str, needle: str) -> bool:
    return bool(needle) and re.search(rf"(?<![^\W_]){re.escape(needle)}(?![^\W_])", text, re.IGNORECASE) is not None


def _forms(name: str) -> list[str]:
    full = name.strip()
    first = full.split()[0] if full.split() else ""
    # A title's article is no name: "The Acolyte" is never "The".
    usable = len(first) >= 3 and first != full and first.lower() not in ("the", "a", "an")
    return [form for form in [full, *([first] if usable else [])] if form]


def _is_named(said: str, name: str) -> bool:
    return any(form.lower() == said.strip().lower() for form in _forms(name))


def narrate_segments(text: str, cast: Sequence[Mapping[str, Any]], seat: str) -> list[dict[str, Any]]:
    """A narration's parts in order: the narrator's and each interlude's, the seat's name cutting it there."""
    parts: list[dict[str, Any]] = []

    def push(who: str | None, line: str) -> None:
        if parts and parts[-1]["speaker_id"] == who:
            parts[-1]["lines"].append(line)
        else:
            parts.append({"speaker_id": who, "lines": [line]})

    def leads(line: str, name: str) -> bool:
        return any(re.match(rf"\*\s*{re.escape(form)}(?![^\W_])", line, re.IGNORECASE) for form in _forms(name))

    def is_seat(said: str) -> bool:
        return bool(seat.strip()) and _is_named(said, seat)

    def member_of(said: str) -> str | None:
        return next((str(member["id"]) for member in cast if _is_named(said, str(member["name"]))), None)

    speaker: str | None = None
    mark = str(PROMPT["interlude_mark"])
    for line in text.split("\n"):
        trimmed = line.strip()
        if trimmed.startswith(mark):
            said = trimmed[len(mark) :].strip()
            if is_seat(said):
                break
            speaker = member_of(said)
            continue
        # The play-test: a line in a cast member's name ("The Acolyte: ..." or "*The Acolyte ...") is theirs
        # too, for that line; the seat's name cuts the narration there.
        tagged = re.match(r"([^:\n]{1,60}):\s*(.*)$", trimmed)
        if tagged is not None and (is_seat(tagged.group(1)) or member_of(tagged.group(1)) is not None):
            if is_seat(tagged.group(1)):
                break
            push(member_of(tagged.group(1)), tagged.group(2))
            continue
        if trimmed.startswith("*"):
            if seat.strip() and leads(trimmed, seat):
                break
            actor = next((str(member["id"]) for member in cast if leads(trimmed, str(member["name"]))), None)
            if actor is not None:
                push(actor, line)
                continue
        push(speaker, line)
    segments: list[dict[str, Any]] = []
    for part in parts:
        body = "\n".join(part["lines"]).strip()
        if not body:
            continue
        if segments and segments[-1]["speaker_id"] == part["speaker_id"]:
            segments[-1]["text"] = f"{segments[-1]['text']}\n\n{body}"
        else:
            segments.append({"speaker_id": part["speaker_id"], "text": body})
    return segments


def _sentences(text: str) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    offset = 0
    for line in text.split("\n"):
        for match in _SENTENCE.finditer(line):
            body = match.group(0).strip()
            if body:
                found.append((offset + match.start() + len(match.group(0)) - len(match.group(0).lstrip()), body))
        offset += len(line) + 1
    return found


def _quotes(sentence: str) -> bool:
    return re.search(r"[\"“”‘’]|(^|\s)'", sentence) is not None  # noqa: RUF001


def _names(sentence: str, ref: Mapping[str, str]) -> bool:
    if any(_word(sentence, form) for form in _forms(ref["name"])):
        return True
    words = list(
        dict.fromkeys(
            one
            for one in re.split(r"[^\w']+", ref["line"].lower())
            if len(one) >= int(VOICE_GUARD["min_word"]) and one not in VOICE_GUARD["stop_words"] and "_" not in one
        )
    )
    return sum(1 for one in words if _word(sentence, one)) >= int(VOICE_GUARD["descriptor_words"])


def speaks_for(text: str, refs: Sequence[Mapping[str, str]]) -> dict[str, Any] | None:
    """The first sentence that quotes dialogue and names one of ``refs`` (the seat), with where to cut."""
    found = _sentences(text)
    for index, (at, sentence) in enumerate(found):
        if not any(_names(sentence, ref) for ref in refs):
            continue
        if _quotes(sentence):
            return {"at": at, "span": sentence}
        if index + 1 < len(found) and re.match(r"[\"“‘']", found[index + 1][1]):  # noqa: RUF001
            return {"at": at, "span": f"{sentence} {found[index + 1][1]}"}
    return None


def stranger_in(text: str) -> dict[str, Any] | None:
    """The first sentence where a party voice treats someone as a stranger."""
    for at, sentence in _sentences(text):
        if any(phrase in sentence.lower() for phrase in VOICE_GUARD["stranger_phrases"]):
            return {"at": at, "span": sentence}
    return None
