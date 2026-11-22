# SPDX-License-Identifier: AGPL-3.0-or-later
"""Schema-constrained turns (the operator, 2026-11-21): the model answers JSON ``{"items": [...]}``, so
every beat is credited by construction, never by splitting prose.

The twin of client/src/features/chat/structured.ts, held to contract/structured-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.PlayerLines import format_player_lines  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.VoiceGuard import replay_of  # type: ignore[import-not-found]

STRUCTURED: dict[str, Any] = CONTRACT["structured"]
_MANNERS: list[str] = list(CONTRACT["player_lines"]["manners"])
_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f"}


def turn_schema() -> dict[str, Any]:
    """The JSON schema for one turn; ``text`` comes last, so an item's other fields are known first."""

    def nullable(description: str) -> dict[str, Any]:
        return {"type": ["string", "null"], "description": description}

    descriptions = STRUCTURED["descriptions"]
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": list(STRUCTURED["kinds"])},
                        "speaker": nullable(descriptions["speaker"]),
                        "target": nullable(descriptions["target"]),
                        "manner": {"type": ["string", "null"], "enum": [*_MANNERS, None]},
                        "text": {"type": "string", "description": descriptions["text"]},
                    },
                    "required": ["kind", "speaker", "target", "manner", "text"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["items"],
        "additionalProperties": False,
    }


def _read_string(source: str, at: int) -> tuple[str, int]:
    """A JSON string from ``at`` (past its opening quote): its value so far, and the index past its close."""
    value: list[str] = []
    index = at
    while index < len(source):
        char = source[index]
        if char == '"':
            return "".join(value), index + 1
        if char == "\\":
            if index + 1 >= len(source):
                break
            following = source[index + 1]
            if following == "u":
                digits = source[index + 2 : index + 6]
                if len(digits) < 4:
                    break
                value.append(chr(int(digits, 16)))
                index += 6
                continue
            value.append(_ESCAPES.get(following, following))
            index += 2
            continue
        value.append(char)
        index += 1
    return "".join(value), -1


def partial_items(source: str) -> list[dict[str, Any]]:
    """The items in a (possibly unfinished) answer, as far as they can be read."""
    items: list[dict[str, Any]] = []
    key = re.search(r'"items"\s*:\s*\[', source)
    if key is None:
        return items
    index = key.end()

    def skip(at: int, chars: str) -> int:
        while at < len(source) and source[at] in chars:
            at += 1
        return at

    while True:
        index = skip(index, " \t\r\n,")
        if index >= len(source) or source[index] != "{":
            return items
        index += 1
        item: dict[str, Any] = {"fields": {}, "has_text": False, "text": "", "closed": False}
        items.append(item)
        while True:
            index = skip(index, " \t\r\n,")
            if index >= len(source):
                return items
            if source[index] == "}":
                item["closed"] = True
                index += 1
                break
            if source[index] != '"':
                return items
            name, end = _read_string(source, index + 1)
            if end == -1:
                return items
            index = skip(end, " \t\r\n")
            if index >= len(source) or source[index] != ":":
                return items
            index = skip(index + 1, " \t\r\n")
            if index >= len(source):
                return items
            if source[index] == '"':
                value, end = _read_string(source, index + 1)
                if name == "text":
                    item["has_text"] = True
                    item["text"] = value
                elif end != -1:
                    item["fields"][name] = value
                if end == -1:
                    return items
                index = end
            else:
                token = re.match(r"[^,}\s]+", source[index:])
                if token is None or index + len(token.group(0)) >= len(source):
                    return items
                if name != "text":
                    item["fields"][name] = None if token.group(0) == "null" else token.group(0)
                index += len(token.group(0))


def _same(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


class ItemStream:
    """A streaming answer read as it comes; an item in the seat's name ends it (``cut``)."""

    def __init__(self, people: Sequence[Mapping[str, Any]], seat_name: str) -> None:
        self.people = people
        self.seat_name = seat_name
        self.mode = "unknown"
        self.cut = False
        self.text = ""
        self._sent: list[dict[str, Any]] = []

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        self.text += chunk
        if self.mode == "unknown":
            stripped = self.text.lstrip()
            if not stripped:
                return []
            self.mode = "json" if stripped[0] == "{" else "text"
        if self.mode != "json" or self.cut:
            return []
        events: list[dict[str, Any]] = []
        for index, item in enumerate(partial_items(self.text)):
            if index >= len(self._sent):
                self._sent.append({"started": False, "length": 0, "ended": False})
            state = self._sent[index]
            kind = item["fields"].get("kind")
            if not state["started"]:
                if not (item["closed"] or (item["has_text"] and isinstance(kind, str))):
                    break
                if kind not in STRUCTURED["kinds"]:
                    state["started"] = state["ended"] = True
                    continue
                speaker = None if kind == "narrate" else item["fields"].get("speaker")
                if speaker is not None and self.seat_name and _same(speaker, self.seat_name):
                    self.cut = True
                    break
                state["started"] = True
                speaker_id = (
                    next((str(person["id"]) for person in self.people if _same(str(person["name"]), speaker)), None)
                    if speaker is not None
                    else None
                )
                events.append(
                    {
                        "type": "item_start",
                        "item": {
                            "index": index,
                            "kind": kind,
                            "speaker": speaker,
                            "speaker_id": speaker_id,
                            "target": item["fields"].get("target"),
                            "manner": item["fields"].get("manner"),
                        },
                    }
                )
            if state["ended"]:
                continue
            if len(item["text"]) > state["length"]:
                events.append({"type": "item_text", "index": index, "delta": item["text"][state["length"] :]})
                state["length"] = len(item["text"])
            if item["closed"]:
                state["ended"] = True
                events.append({"type": "item_end", "index": index, "text": item["text"]})
            else:
                break
        return events


def structured_runs(
    items: Sequence[Mapping[str, Any]], people: Sequence[Mapping[str, Any]], seat_name: str
) -> dict[str, Any]:
    """The finished items as messages, one per run of the same speaker, cut at the seat's first item."""
    runs: list[dict[str, Any]] = []
    for item in items:
        kind = item["fields"].get("kind")
        if not item["closed"] or kind not in STRUCTURED["kinds"]:
            continue
        text = str(item["text"]).strip()
        if not text:
            continue
        said = None if kind == "narrate" else (str(item["fields"].get("speaker") or "").strip() or None)
        if said is not None and seat_name and _same(said, seat_name):
            return {"runs": runs, "cut": True}
        person = next((one for one in people if _same(str(one["name"]), said)), None) if said is not None else None
        speaker_id = str(person["id"]) if person is not None else None
        speaker_name = said if said is not None and person is None else None
        target_name = str(item["fields"].get("target") or "").strip()
        target = next((one for one in people if _same(str(one["name"]), target_name)), None) if target_name else None
        manner = item["fields"].get("manner")
        line = {
            "speaker_id": speaker_id,
            "kind": "narrate" if said is None else kind,
            "manner": (manner if manner in _MANNERS else "speak") if kind == "say" else None,
            "target_id": str(target["id"]) if target is not None else None,
            "target_name": target_name if target is None and target_name else None,
            "text": text,
        }
        if runs and runs[-1]["speaker_id"] == speaker_id and runs[-1]["speaker_name"] == speaker_name:
            runs[-1]["lines"].append(line)
        else:
            runs.append({"speaker_id": speaker_id, "speaker_name": speaker_name, "lines": [line]})
    return {"runs": runs, "cut": False}


def run_text(run: Mapping[str, Any], people: Sequence[Mapping[str, Any]]) -> str:
    """A run's saved text: the narrator's prose as paragraphs, anyone else's as their structured lines."""
    if run["speaker_id"] is None and run["speaker_name"] is None:
        return "\n\n".join(line["text"] for line in run["lines"])
    known = [*people, {"id": "", "name": run["speaker_name"] or ""}] if run["speaker_id"] is None else list(people)
    return str(format_player_lines([{**line, "speaker_id": run["speaker_id"] or ""} for line in run["lines"]], known))


def fresh_items(items: Sequence[Mapping[str, Any]], earlier: Sequence[str]) -> list[Mapping[str, Any]]:
    """The items that tell something new: one that replays the story so far is dropped before save."""
    return [
        item
        for item in items
        if replay_of(f'"{item["text"]}"' if item["fields"].get("kind") == "say" else str(item["text"]), earlier) is None
    ]
