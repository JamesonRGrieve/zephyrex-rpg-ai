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
from zephyrex.extensions.ai_chat.PlayerLines import line_speaker  # type: ignore[import-not-found]

VOICE_GUARD: dict[str, Any] = CONTRACT["voice_guard"]
PLAYER_LINES: dict[str, Any] = CONTRACT["player_lines"]
# The seat, among the people a line may open with.
_SEAT = "\u0000seat"
# A name as the narrator writes an unnamed NPC's: "The Barkeep", "Captain Rho", "Old Tom".
_NAMEISH = re.compile(r"(?:(?:The|A|An)\s+)?[A-Z][A-Za-z'-]*(?:\s+(?:of\s+|the\s+)?[A-Z][A-Za-z'-]*){0,3}")
# A say line's speaker and its parenthesis: `X (to Y): ...`, `X (vox to Y): ...`, `X (voxcast): ...`.
_SAY_FORM = re.compile(r"([^:(\n\"“*]{1,40}?)\s*\((?:to\b|vox\b|voxcast)[^)]*\)\s*:", re.IGNORECASE)
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


def _head_noun(line: str) -> str:
    """A one-line's head noun: its first word that isn't small or a stop word ("A thief with..." -> thief)."""
    for one in re.split(r"[^\w']+", line.lower()):
        if len(one) >= int(VOICE_GUARD["min_word"]) and one not in VOICE_GUARD["stop_words"] and "_" not in one:
            return one
    return ""


def _mention_at(text: str, member: Mapping[str, Any]) -> int:
    """Where a paragraph first mentions a member: by name, first name, or "the <head noun>"; -1 if never."""
    found = [
        match.start()
        for form in _forms(str(member["name"]))
        if (match := re.search(rf"(?<![^\W_]){re.escape(form)}(?![^\W_])", text, re.IGNORECASE)) is not None
    ]
    head = _head_noun(str(member.get("line") or ""))
    if head and (match := re.search(rf"(?<![^\W_])the\s+{re.escape(head)}(?![^\W_])", text, re.IGNORECASE)):
        found.append(match.start())
    return min(found) if found else -1


def _attributed(line: str, cast: Sequence[Mapping[str, Any]]) -> dict[str, Any] | None:
    """The fallback when the narrator writes a cast member in prose (the play-test): see voiceGuard.ts."""
    found = _sentences(line)
    quoted = [_quotes(sentence) for _at, sentence in found]
    if True not in quoted:
        return None
    first = quoted.index(True)
    last = len(quoted) - 1 - quoted[::-1].index(True)
    # "...?' she hisses." belongs with the speech it attributes.
    while last + 1 < len(found) and found[last + 1][1][:1].islower():
        last += 1
    end = found[last][0] + len(found[last][1])
    reach = line[:end]
    named = sorted(((at, member) for member in cast if (at := _mention_at(reach, member)) >= 0), key=lambda one: one[0])
    if not named:
        return None
    mention, member = named[0]
    covering = next((index for index, (at, sentence) in enumerate(found) if at + len(sentence) > mention), first)
    start = found[min(first, covering)][0]
    return {"before": line[:start], "id": str(member["id"]), "body": line[start:end], "after": line[end:]}


def narrate_segments(text: str, cast: Sequence[Mapping[str, Any]], seat: str) -> list[dict[str, Any]]:
    """A narration's parts in order: the narrator's and each interlude's, the seat's name cutting it there."""
    parts: list[dict[str, Any]] = []

    def push(who: str | None, line: str, name: str | None = None) -> None:
        if parts and parts[-1]["speaker_id"] == who and parts[-1]["speaker_name"] == name:
            parts[-1]["lines"].append(line)
        else:
            parts.append({"speaker_id": who, "speaker_name": name, "lines": [line]})

    def stranger(said: str) -> str | None:
        # Someone the narrator voices who isn't a person yet (the play-test's barkeep): not the narrator.
        name = said.strip()
        return name if _NAMEISH.fullmatch(name) and name.lower() != str(PLAYER_LINES["narrator"]).lower() else None

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
        # Structured lines (PlayerLines.py): "Narrator: ..." is the narrator's; a line opening with a cast
        # member's name is theirs; one opening with the seat's cuts the narration there.
        narrated = re.match(rf"{re.escape(PLAYER_LINES['narrator'])}:\s*", trimmed, re.IGNORECASE)
        if narrated is not None:
            push(None, trimmed[narrated.end() :])
            continue
        # The play-test: a line in a cast member's name ("The Acolyte: ..." or "*The Acolyte ...") is theirs
        # too, for that line; the seat's name cuts the narration there.
        tagged = re.match(r"([^:\n]{1,60}):\s*(.*)$", trimmed)
        if tagged is not None and (is_seat(tagged.group(1)) or member_of(tagged.group(1)) is not None):
            if is_seat(tagged.group(1)):
                break
            push(member_of(tagged.group(1)), tagged.group(2))
            continue
        if tagged is not None and stranger(tagged.group(1)) is not None:
            push(None, tagged.group(2), stranger(tagged.group(1)))
            continue
        if trimmed.startswith("*"):
            if seat.strip() and leads(trimmed, seat):
                break
            actor = next((str(member["id"]) for member in cast if leads(trimmed, str(member["name"]))), None)
            if actor is not None:
                push(actor, line)
                continue
        opener = line_speaker(trimmed, [*cast, *([{"id": _SEAT, "name": seat}] if seat.strip() else [])])
        if opener == _SEAT:
            break
        if opener is not None:
            push(opener, line)
            continue
        sayer = _SAY_FORM.match(trimmed)
        if sayer is not None and stranger(sayer.group(1)) is not None:
            push(None, line, stranger(sayer.group(1)))
            continue
        if speaker is None and (split := _attributed(line, cast)) is not None:
            if split["before"].strip():
                push(None, split["before"])
            push(split["id"], split["body"])
            if split["after"].strip():
                push(None, split["after"])
            continue
        push(speaker, line)
    segments: list[dict[str, Any]] = []
    for part in parts:
        body = "\n".join(part["lines"]).strip()
        if not body:
            continue
        last = segments[-1] if segments else None
        who = (part["speaker_id"], part["speaker_name"])
        if last is not None and (last["speaker_id"], last["speaker_name"]) == who:
            last["text"] = f"{last['text']}\n\n{body}"
        else:
            segments.append({"speaker_id": part["speaker_id"], "speaker_name": part["speaker_name"], "text": body})
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


def meta_break(text: str) -> dict[str, Any] | None:
    """The first sentence that breaks character (an apology, "let me continue", the narrative...)."""
    for at, sentence in _sentences(text):
        if any(phrase in sentence.lower() for phrase in VOICE_GUARD["meta_phrases"]):
            return {"at": at, "span": sentence}
    return None


def _closes(text: str, mark: str) -> bool:
    return text.endswith(mark) and len(text.split(mark)) % 2 == 1


def complete_text(text: str) -> str:
    """A reply trimmed back to its last complete sentence or line; whole when it ends complete, '' when
    nothing in it is."""
    trimmed = text.rstrip()
    if not trimmed:
        return ""
    if re.search(r"[.!?…][\"”’'*)\]]*$", trimmed) or _closes(trimmed, "*") or _closes(trimmed, '"'):  # noqa: RUF001
        return trimmed
    end = -1
    for match in re.finditer(r"[.!?…][\"”’'*)\]]*(?=\s)", trimmed):  # noqa: RUF001
        end = match.end()
    cut = max(end, trimmed.rfind("\n"))
    return "" if cut <= 0 else trimmed[:cut].rstrip()


def plain_dashes(text: str) -> str:
    """A reply without em dashes, no model call: one that breaks a line off becomes an ellipsis, one
    before a new sentence a full stop, any other a comma; "--" counts as one too."""
    text = re.sub(r"[ \t]*(?:—|--)(?=[\"”’'*)]|[ \t]*(?:\n|$))", "...", text)  # noqa: RUF001
    text = re.sub(r"[ \t]*(?:—|--)[ \t]*(?=[\"“‘']?[A-Z])", ". ", text)  # noqa: RUF001
    return re.sub(r"[ \t]*(?:—|--)[ \t]*", ", ", text)


def seat_cut(text: str, seat: str) -> str:
    """A narration cut before its first sentence that acts for the person's seat: one whose subject is the
    seat (its name, its first name, or "you") followed by a verb other than one of perceiving."""
    if not seat.strip():
        return text
    names = sorted([*_forms(seat), "you"], key=lambda name: -len(name))
    narrator = re.escape(PLAYER_LINES["narrator"])
    alternatives = "|".join(re.escape(name) for name in names)
    subject = re.compile(
        rf"(?:{narrator}:\s*)?[\"“*]?(?:{alternatives})\s+([^\W\d_][\w']*)",
        re.IGNORECASE,
    )
    for at, sentence in _sentences(text):
        hit = subject.match(sentence)
        if hit is None:
            continue
        verb = hit.group(1)
        if verb.lower() in VOICE_GUARD["seat_perception"] or not verb[:1].islower():
            continue
        return text[:at].rstrip()
    return text


def _trigrams(text: str) -> set[str]:
    words = [word for word in re.findall(r"[\w']+", text.lower()) if "_" not in word]
    return {f"{words[index]} {words[index + 1]} {words[index + 2]}" for index in range(len(words) - 2)}


def _bare(text: str) -> str:
    """Words alone, lower case, one space apart: what "said word for word" compares."""
    return " ".join(word for word in re.findall(r"[\w']+", text.lower()) if "_" not in word)


def replay_of(text: str, earlier: Sequence[str]) -> dict[str, Any] | None:
    """What a reply retells of the story so far (the operator, 2026-11-22), no model call: a paragraph
    mostly in the last window_chars of story by word trigrams, or a quoted line said word for word
    before. Every span, for one regeneration (forbid.spans); ``at`` and ``span`` are the first."""
    replay = VOICE_GUARD["replay"]
    kept: list[str] = []
    size = 0
    for line in reversed(list(earlier)):
        if size >= int(replay["window_chars"]):
            break
        kept.insert(0, line)
        size += len(line) + 1
    story = "\n".join(kept)
    old = _trigrams(story)
    spoken = f" {_bare(story)} "
    found: list[tuple[int, str]] = []
    offset = 0
    for line in text.split("\n"):
        paragraph = line.strip()
        fresh = _trigrams(paragraph)
        if len(fresh) >= int(replay["min_trigrams"]) and len(fresh & old) / len(fresh) >= float(replay["threshold"]):
            found.append((offset + line.find(paragraph), paragraph))
        else:
            for quote in re.finditer(r'["\u201c]([^"\u201d]+)["\u201d]', line):
                words = _bare(quote.group(1))
                if len(words.split(" ")) >= int(replay["quote_words"]) and f" {words} " in spoken:
                    found.append((offset + quote.start(), quote.group(1).strip()))
        offset += len(line) + 1
    if not found:
        return None
    return {"at": found[0][0], "span": found[0][1], "spans": [span for _at, span in found]}


def paragraph_cut(text: str) -> int:
    """Where a runaway story stream stops: the blank line ending the runaway paragraphs-th paragraph, once
    anything follows it, never mid-sentence; -1 while within the limit."""
    count = 0
    for gap in re.finditer(r"\n[ \t]*\n\s*", text):
        if not text[: gap.start()].strip():
            continue
        count += 1
        if count >= int(VOICE_GUARD["runaway"]["paragraphs"]) and gap.end() < len(text):
            return gap.start()
    return -1


def echo_of(text: str, line: str) -> bool:
    """Whether a reply's text only echoes the person's latest line: echo_overlap or more of its word
    trigrams are the line's."""
    said = _trigrams(text)
    if not said:
        return False
    return len(said & _trigrams(line)) / len(said) >= float(CONTRACT["structured"]["echo_overlap"])
