# SPDX-License-Identifier: AGPL-3.0-or-later
"""SillyTavern's macros (audit gap 1), so imported cards, lorebooks, presets and quick replies read
as their authors wrote them.

The twin of client/src/features/prompt/macros.ts, held to contract/macro-cases.json.

Syntax, as SillyTavern's: ``{{name}}``, ``{{name::arg::arg}}``, and the older ``{{name:arg}}`` (for
random, a comma list); names are case-insensitive; macros nest, the innermost first, left to right;
``<BOT>`` and ``<USER>`` are the oldest spellings of char and user. A macro this doesn't know stays
as written.

Nothing here reads a clock or a random source of its own: the caller passes ``now`` and ``random``,
so both twins give the same text for the same context; without them, the time and random macros stay
as written. ``pick`` is stable: the same chat, text and place pick the same item on every
regeneration (FNV-1a over them, as UTF-8).
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

FIELDS = {
    "persona": "persona",
    "description": "description",
    "personality": "personality",
    "scenario": "scenario",
    "mesexamples": "mesExamples",
    "charprompt": "charPrompt",
    "charinstruction": "charInstruction",
    "charjailbreak": "charInstruction",
    "model": "model",
}
_INNERMOST = re.compile(r"\{\{((?:(?!\{\{|\}\})[\s\S])*)\}\}")
_KEPT = re.compile("\x00(\\d+)\x00")
_FORMAT_TOKENS = re.compile(r"YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a|\[[^\]]*\]")
_NAME = re.compile(r"^([A-Za-z_][\w+-]*)", re.ASCII)
_DICE = re.compile(r"^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$", re.IGNORECASE)
_VARIABLE = re.compile(r"^(get|set|add|inc|dec)(global)?var$")
_UTC = re.compile(r"^time_utc([+-]\d{1,2})$")
MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
_TIME_FORMATS = {
    "time": "h:mm A",
    "date": "MMMM D, YYYY",
    "weekday": "dddd",
    "isotime": "HH:mm",
    "isodate": "YYYY-MM-DD",
}


@dataclass
class MacroContext:
    names: Mapping[str, str]
    group: str = ""
    not_char: str | None = None
    fields: Mapping[str, str] = field(default_factory=dict)
    chat: Mapping[str, Any] = field(default_factory=dict)
    now: Mapping[str, float] | None = None
    random: Callable[[], float] | None = None
    local: Mapping[str, str] = field(default_factory=dict)
    global_: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Expanded:
    text: str
    local: dict[str, str]
    global_: dict[str, str]


def _round(value: float) -> int:
    """JavaScript's Math.round: halves go up, as the lite twin's do."""
    return math.floor(value + 0.5)


def format_date(epoch_ms: float, offset_minutes: float, fmt: str) -> str:
    """A moment.js-style format (the tokens SillyTavern's datetimeformat uses most)."""
    at = datetime.fromtimestamp(epoch_ms / 1000, tz=UTC) + timedelta(minutes=offset_minutes)
    hour12 = 12 if at.hour % 12 == 0 else at.hour % 12
    weekday = (at.weekday() + 1) % 7
    tokens = {
        "YYYY": str(at.year),
        "YY": f"{at.year % 100:02d}",
        "MMMM": MONTHS[at.month - 1],
        "MMM": MONTHS[at.month - 1][:3],
        "MM": f"{at.month:02d}",
        "M": str(at.month),
        "DD": f"{at.day:02d}",
        "D": str(at.day),
        "dddd": DAYS[weekday],
        "ddd": DAYS[weekday][:3],
        "HH": f"{at.hour:02d}",
        "H": str(at.hour),
        "hh": f"{hour12:02d}",
        "h": str(hour12),
        "mm": f"{at.minute:02d}",
        "ss": f"{at.second:02d}",
        "A": "AM" if at.hour < 12 else "PM",
        "a": "am" if at.hour < 12 else "pm",
    }

    def token(match: re.Match[str]) -> str:
        word = match.group(0)
        return word[1:-1] if word.startswith("[") else tokens.get(word, word)

    return _FORMAT_TOKENS.sub(token, fmt)


def human_duration(seconds: float) -> str:
    """How long ago, as moment.js's humanize says it."""
    s = max(0.0, seconds)
    minutes, hours, days = _round(s / 60), _round(s / 3600), _round(s / 86_400)
    if s < 45:
        return "a few seconds"
    if s < 90:
        return "a minute"
    if minutes < 45:
        return f"{minutes} minutes"
    if minutes < 90:
        return "an hour"
    if hours < 22:
        return f"{hours} hours"
    if hours < 36:
        return "a day"
    if days < 26:
        return f"{days} days"
    if days < 45:
        return "a month"
    if days < 320:
        return f"{_round(days / 30.4375)} months"
    if days < 548:
        return "a year"
    return f"{_round(days / 365.25)} years"


def fnv1a(text: str) -> int:
    """FNV-1a, 32-bit, over UTF-8: the same number in both twins."""
    value = 0x811C9DC5
    for byte in text.encode("utf-8"):
        value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
    return value


def _number(value: str) -> float | None:
    if value.strip() == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _number_text(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return repr(float(f"{value:.10f}"))


def _roll(formula: str, draw: Callable[[], float]) -> str | None:
    dice = _DICE.match(formula)
    if dice is not None:
        count = 1 if dice.group(1) in ("", None) else int(dice.group(1))
        sides = int(dice.group(2))
        if count < 1 or count > 100 or sides < 1:
            return None
        total = sum(math.floor(draw() * sides) + 1 for _ in range(count))
        bonus = 0 if dice.group(4) is None else int(dice.group(4)) * (-1 if dice.group(3) == "-" else 1)
        return str(total + bonus)
    if re.fullmatch(r"\s*\d+\s*", formula):
        sides = int(formula)
        return None if sides < 1 else str(math.floor(draw() * sides) + 1)
    return None


def _parse(body: str) -> tuple[str, list[str]]:
    """A macro's name and its arguments: ``name::a::b``, the older ``name:a``, or ``name a``."""
    trimmed = body.strip()
    if trimmed.startswith("//"):
        return "//", []
    if trimmed[:1] in (".", "$"):
        return trimmed[0], [trimmed[1:].strip()]
    named = _NAME.match(trimmed)
    if named is None:
        return "", []
    name = named.group(1).lower()
    rest = trimmed[named.end() :]
    if rest == "":
        return name, []
    if rest.startswith("::"):
        return name, rest[2:].split("::")
    if rest.startswith(":"):
        return name, [rest[1:]]
    if rest[0].isspace():
        return name, [rest.strip()]
    return "", []


def expand_all(text: str, context: MacroContext) -> Expanded:
    """The text with every macro it knows filled in; the variables as the text left them."""
    local = dict(context.local)
    global_ = dict(context.global_)
    draw = context.random
    kept: list[str] = []
    picks: dict[str, int] = {}
    chat = context.chat
    names = context.names

    def value(whole: str, body: str) -> str | None:
        name, args = _parse(body)
        first = args[0] if args else ""
        simple = {
            "char": names["char"],
            "user": names["user"],
            "group": context.group or names["char"],
            "charifnotgroup": context.group or names["char"],
            "notchar": context.not_char if context.not_char is not None else names["user"],
            "lastmessage": chat.get("last_message", ""),
            "lastusermessage": chat.get("last_user_message", ""),
            "lastcharmessage": chat.get("last_char_message", ""),
            "lastmessageid": chat.get("last_message_id", ""),
            "firstincludedmessageid": chat.get("first_included_message_id", ""),
            "input": chat.get("input", ""),
            "newline": "\n",
            "noop": "",
            "//": "",
            "trim": "\x01",
            "outlet": "",
        }
        if name in simple:
            return str(simple[name])
        if name == "idle_duration":
            idle = chat.get("idle_seconds")
            return None if idle is None else human_duration(float(idle))
        if name == "reverse":
            return first[::-1]
        if name in ("random", "pick"):
            items = args if len(args) > 1 else first.split(",")
            if first == "":
                return None
            if name == "random":
                return None if draw is None else items[math.floor(draw() * len(items))].strip()
            seen = picks.get(whole, 0)
            picks[whole] = seen + 1
            seed = fnv1a(f"{chat.get('chat_id', '')}\x00{text}\x00{whole}\x00{seen}")
            return items[seed % len(items)].strip()
        if name == "roll":
            return None if draw is None else _roll(first, draw)
        if name in _TIME_FORMATS:
            if context.now is None:
                return None
            return format_date(context.now["epoch_ms"], context.now["utc_offset_minutes"], _TIME_FORMATS[name])
        if name == "datetimeformat":
            if context.now is None:
                return None
            return format_date(context.now["epoch_ms"], context.now["utc_offset_minutes"], first)
        if name == ".":
            return local.get(first, "")
        if name == "$":
            return global_.get(first, "")
        utc = _UTC.match(name)
        if utc is not None:
            if context.now is None:
                return None
            return format_date(context.now["epoch_ms"], int(utc.group(1)) * 60, "h:mm A")
        if name in FIELDS:
            return context.fields.get(FIELDS[name], "")
        variable = _VARIABLE.match(name)
        if variable is not None:
            store = global_ if variable.group(2) else local
            key = first.strip()
            if key == "":
                return None
            current = store.get(key, "")
            kind = variable.group(1)
            if kind == "get":
                return current
            if kind == "set":
                store[key] = args[1] if len(args) > 1 else ""
                return ""
            if kind == "add":
                added = args[1] if len(args) > 1 else ""
                left, right = _number(current or "0"), _number(added)
                store[key] = _number_text(left + right) if left is not None and right is not None else current + added
                return ""
            store[key] = _number_text((_number(current) or 0) + (1 if kind == "inc" else -1))
            return store[key]
        return None

    current = text.replace("<BOT>", names["char"]).replace("<USER>", names["user"])
    while True:
        found = False

        def fill(match: re.Match[str]) -> str:
            nonlocal found
            found = True
            filled = value(match.group(0), match.group(1))
            if filled is not None:
                return filled
            kept.append(match.group(0))
            return f"\x00{len(kept) - 1}\x00"

        current = _INNERMOST.sub(fill, current)
        if not found:
            break
    # {{trim}} takes the line breaks around it with it.
    current = re.sub(r"[\r\n]*\x01[\r\n]*", "", current)
    # An unknown macro is put back as written (its inner macros filled in).
    for _guard in range(64):
        if "\x00" not in current:
            break
        current = _KEPT.sub(lambda match: kept[int(match.group(1))], current)
    return Expanded(text=current, local=local, global_=global_)


def expand_macros(text: str, names: Mapping[str, str]) -> str:
    """The names only, as before: ``{{char}}``, ``{{user}}`` and their spellings (and every macro
    with no context)."""
    return expand_all(text, MacroContext(names=names)).text
