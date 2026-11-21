# SPDX-License-Identifier: AGPL-3.0-or-later
"""Structured lines (the operator, 2026-11-21): the person's message and the AI's answers, one item per line.
say: ``Name (to Target): "text"`` with an optional manner (``to X, whispers``, ``to everyone, shouts``,
``vox to X``, ``voxcast``); do: ``Name action...``; narrate: ``Narrator: text``; any other line is narration.

The twin of client/src/features/chat/playerLines.ts, held to contract/player-lines-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

PLAYER_LINES: dict[str, Any] = CONTRACT["player_lines"]


def _forms(people: Sequence[Mapping[str, Any]]) -> list[tuple[str, str]]:
    """Each person's name forms, longest first: the full name, and a first name unique among them."""
    firsts: dict[str, int] = {}
    for person in people:
        first = (str(person["name"]).strip().split() or [""])[0].lower()
        firsts[first] = firsts.get(first, 0) + 1
    found: list[tuple[str, str]] = []
    for person in people:
        full = str(person["name"]).strip()
        if not full:
            continue
        found.append((full, str(person["id"])))
        first = full.split()[0]
        if (
            first != full
            and len(first) >= 3
            and first.lower() not in PLAYER_LINES["articles"]
            and firsts.get(first.lower()) == 1
        ):
            found.append((first, str(person["id"])))
    return sorted(found, key=lambda one: -len(one[0]))


def _named(said: str, people: Sequence[Mapping[str, Any]]) -> str | None:
    return next((id_ for form, id_ in _forms(people) if form.lower() == said.strip().lower()), None)


def _opening(line: str, people: Sequence[Mapping[str, Any]]) -> tuple[str, str] | None:
    for form, id_ in _forms(people):
        if line[: len(form)].lower() != form.lower():
            continue
        rest = line[len(form) :]
        if rest == "" or re.match(r"[\s(:]", rest):
            return id_, rest
    return None


def _unquote(text: str) -> str:
    trimmed = text.strip()
    return trimmed[1:-1] if len(trimmed) >= 2 and re.fullmatch(r"[\"“].*[\"”]", trimmed, re.DOTALL) else trimmed


def _target(name: str, people: Sequence[Mapping[str, Any]]) -> str | None:
    return None if name.strip().lower() == PLAYER_LINES["everyone"] else _named(name, people)


def _said(paren: str, people: Sequence[Mapping[str, Any]]) -> tuple[str, str | None]:
    text = paren.strip()
    if text.lower() == "voxcast":
        return "voxcast", None
    if (vox := re.fullmatch(r"vox\s+to\s+(.+)", text, re.IGNORECASE)) is not None:
        return "vox", _target(vox.group(1), people)
    to = re.fullmatch(r"to\s+(.+?)(?:\s*,\s*(\w+))?", text, re.IGNORECASE)
    if to is None:
        return "speak", None
    word = (to.group(2) or "").lower()
    manner = next((key for key, verb in PLAYER_LINES["manner_words"].items() if verb == word), "speak")
    return manner, _target(to.group(1), people)


def line_speaker(line: str, people: Sequence[Mapping[str, Any]]) -> str | None:
    """Who a line is spoken by, for a live stream's switch; None for the narrator or no one."""
    trimmed = line.strip()
    if trimmed.lower().startswith(f"{PLAYER_LINES['narrator'].lower()}:"):
        return None
    opened = _opening(trimmed, people)
    return opened[0] if opened else None


def _item(speaker_id: str | None, kind: str, manner: str | None, target_id: str | None, text: str) -> dict[str, Any]:
    return {"speaker_id": speaker_id, "kind": kind, "manner": manner, "target_id": target_id, "text": text}


def parse_player_lines(text: str, people: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """A message's items, one per non-blank line."""
    items: list[dict[str, Any]] = []
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        narrator = re.fullmatch(rf"{re.escape(PLAYER_LINES['narrator'])}:\s*(.*)", line, re.IGNORECASE | re.DOTALL)
        if narrator is not None:
            items.append(_item(None, "narrate", None, None, narrator.group(1).strip()))
            continue
        opened = _opening(line, people)
        if opened is None:
            items.append(_item(None, "narrate", None, None, line))
            continue
        id_, rest = opened
        if (say := re.fullmatch(r"\s*\(([^)]*)\)\s*:\s*(.*)", rest, re.DOTALL)) is not None:
            manner, target = _said(say.group(1), people)
            items.append(_item(id_, "say", manner, target, _unquote(say.group(2))))
            continue
        if (colon := re.fullmatch(r"\s*:\s*(.*)", rest, re.DOTALL)) is not None:
            items.append(_item(id_, "say", "speak", None, _unquote(colon.group(1))))
            continue
        items.append(_item(id_, "do", None, None, rest.strip()))
    return items


def format_player_lines(items: Sequence[Mapping[str, Any]], people: Sequence[Mapping[str, Any]]) -> str:
    """Items as lines again: what parse_player_lines reads back."""

    def name(id_: str | None) -> str:
        return next((str(person["name"]).strip() for person in people if person["id"] == id_), "")

    lines: list[str] = []
    for item in items:
        who = name(item["speaker_id"])
        if item["kind"] == "narrate" or not who:
            lines.append(f"{PLAYER_LINES['narrator']}: {item['text']}")
        elif item["kind"] == "do":
            lines.append(f"{who} {item['text']}")
        else:
            to = (name(item["target_id"]) if item["target_id"] is not None else "") or PLAYER_LINES["everyone"]
            manner = item.get("manner") or "speak"
            if manner == "voxcast":
                paren = "voxcast"
            elif manner == "vox":
                paren = f"vox to {to}"
            elif manner in ("whisper", "shout"):
                paren = f"to {to}, {PLAYER_LINES['manner_words'][manner]}"
            else:
                paren = f"to {to}"
            lines.append(f'{who} ({paren}): "{item["text"]}"')
    return "\n".join(lines)
