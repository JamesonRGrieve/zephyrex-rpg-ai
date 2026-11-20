# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regex scripts (A33), SillyTavern's find-and-replace on chat text. The twin of
client/src/features/chat/regex.ts, held to contract/regex-cases.json.

A script's ``find`` is ``/pattern/flags`` (flags from ``g i m s`` only, so JavaScript and Python
read it alike) or a bare pattern. ``replace`` may use ``$1``–``$99``, ``$&`` or ``{{match}}`` (the
whole match) and ``$$``; a group number the pattern does not have stays as written, as in
JavaScript. A script applies to text at its placements (``user_input``, ``ai_output``), to one
target: ``stored`` (the message as saved), ``display`` (only as shown) or ``prompt`` (only as the
model reads it), and, for display and prompt, only at depths (0 = the newest message) within its
bounds. A pattern that does not compile is skipped.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

ALLOWED_FLAGS = CONTRACT["regex"]["flags"]
_DELIMITED = re.compile(r"^/(.*)/([a-z]*)$", re.DOTALL)
_TOKEN = re.compile(r"\$\$|\$&|\{\{match\}\}|\$(\d\d?)")
_PY_FLAGS = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL}


def compile_find(find: str) -> tuple[re.Pattern[str], bool] | None:
    """The compiled pattern and whether it replaces every match (``g``), or None when invalid."""
    delimited = _DELIMITED.match(find)
    pattern, flags = (delimited.group(1), delimited.group(2)) if delimited else (find, "")
    if pattern == "" or any(flag not in ALLOWED_FLAGS for flag in flags) or len(set(flags)) != len(flags):
        return None
    compiled_flags = 0
    for flag in flags:
        compiled_flags |= _PY_FLAGS.get(flag, 0)
    try:
        return re.compile(pattern, compiled_flags), "g" in flags
    except re.error:
        return None


def _expand(replacement: str, match: re.Match[str]) -> str:
    groups = match.re.groups

    def token(found: re.Match[str]) -> str:
        text = found.group(0)
        if text == "$$":
            return "$"
        if text in ("$&", "{{match}}"):
            return match.group(0)
        digits = found.group(1)
        if int(digits) <= groups and int(digits) > 0:
            return match.group(int(digits)) or ""
        if len(digits) == 2 and 0 < int(digits[0]) <= groups:
            return (match.group(int(digits[0])) or "") + digits[1]
        return text

    return _TOKEN.sub(token, replacement)


def applies(script: Mapping[str, Any], placement: str, target: str, depth: int | None) -> bool:
    if not script["enabled"] or placement not in script["placements"]:
        return False
    script_target = "display" if script["display_only"] else "prompt" if script["prompt_only"] else "stored"
    if script_target != target:
        return False
    if depth is None:
        return True
    low, high = script.get("min_depth"), script.get("max_depth")
    return (low is None or depth >= low) and (high is None or depth <= high)


def apply_regex(text: str, scripts: Sequence[Mapping[str, Any]], placement: str, target: str, depth: int | None = None) -> str:
    """``text`` after every applicable script, in order."""
    for script in scripts:
        if not applies(script, placement, target, depth):
            continue
        compiled = compile_find(script["find"])
        if compiled is None:
            continue
        pattern, every = compiled
        text = pattern.sub(lambda match, script=script: _expand(script["replace"], match), text, count=0 if every else 1)
    return text
