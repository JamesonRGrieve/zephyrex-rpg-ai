# SPDX-License-Identifier: AGPL-3.0-or-later
"""Tool calling for models that support it (A46), over OpenAI-compatible ``tool_calls``.

A streamed reply's calls arrive in pieces by index and are put together in index order; each is
checked against the tools the request offered (a name not offered, or arguments that aren't a JSON
object, is refused and never run: a model chooses only from the options it was given); the
follow-up turn names the calls, then gives each its result or refusal. The lite twin is
client/src/features/chat/toolCalls.ts; both run contract/tool-cases.json.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "tool-cases.json").read_text())
REFUSALS: dict[str, str] = _CASES["refusals"]


def assemble_tool_calls(chunks: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    """The whole calls a stream's pieces make, in index order."""
    by_index: dict[int, dict[str, str]] = {}
    for chunk in chunks:
        call = by_index.setdefault(chunk["index"], {"id": "", "name": "", "arguments": ""})
        if chunk.get("id"):
            call["id"] = chunk["id"]
        if chunk.get("name"):
            call["name"] = chunk["name"]
        call["arguments"] += chunk.get("arguments") or ""
    return [by_index[index] for index in sorted(by_index)]


def _arguments_of(text: str) -> dict[str, Any] | None:
    if not text.strip():
        return {}
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def check_tool_calls(calls: Sequence[Mapping[str, str]], offered: Sequence[str]) -> list[dict[str, Any]]:
    """Each call checked against the tools offered: runnable with its arguments, or refused."""
    checked: list[dict[str, Any]] = []
    for call in calls:
        if call["name"] not in offered:
            checked.append({"id": call["id"], "name": call["name"], "refused": "not_offered"})
            continue
        args = _arguments_of(call["arguments"])
        if args is None:
            checked.append({"id": call["id"], "name": call["name"], "refused": "bad_arguments"})
        else:
            checked.append({"id": call["id"], "name": call["name"], "args": args})
    return checked


def tool_follow_up(
    calls: Sequence[Mapping[str, str]], results: Mapping[str, str], refused: Mapping[str, str]
) -> list[dict[str, Any]]:
    """The turn that goes back to the model: the calls, then each one's result or refusal, in order."""
    messages: list[dict[str, Any]] = [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": call["id"],
                    "type": "function",
                    "function": {"name": call["name"], "arguments": call["arguments"]},
                }
                for call in calls
            ],
        }
    ]
    for call in calls:
        refusal = refused.get(call["id"])
        content = REFUSALS[refusal] if refusal is not None else results.get(call["id"], "")
        messages.append({"role": "tool", "tool_call_id": call["id"], "content": content})
    return messages
