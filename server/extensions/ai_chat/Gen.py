# SPDX-License-Identifier: AGPL-3.0-or-later
"""What STscript's /gen and /genraw ask the chat's model (audit gap 5), as SillyTavern's do: /gen, the
chat's own prompt with the instruction as its last line (a reply's prefill is left out: the answer
isn't a reply); /genraw, the instruction alone.

The twin of client/src/features/prompt/gen.ts, held to contract/gen-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def gen_messages(
    chat: Sequence[Mapping[str, Any]], instruction: str, raw: bool, prefill: str = ""
) -> list[dict[str, Any]]:
    if raw:
        return [{"role": "user", "content": instruction}]
    kept = [dict(message) for message in chat]
    if prefill and kept and kept[-1].get("role") == "assistant" and kept[-1].get("content") == prefill:
        kept = kept[:-1]
    return [*kept, {"role": "system", "content": instruction}]
