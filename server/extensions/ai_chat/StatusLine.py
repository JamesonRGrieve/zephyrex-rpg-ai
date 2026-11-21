# SPDX-License-Identifier: AGPL-3.0-or-later
"""A campaign's status line (the operator, 2026-11-21): one spoiler-safe sentence that tells campaigns apart,
rewritten by the summary model from the rolling summary and the latest story lines only.

The twin of client/src/features/chat/statusLine.ts, held to contract/status-line-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.VoiceGuard import plain_dashes  # type: ignore[import-not-found]

STATUS_LINE: dict[str, Any] = CONTRACT["status_line"]


def status_messages(summary: str, lines: Sequence[str]) -> list[dict[str, str]]:
    """What the summary model is asked: the instruction, then the story so far and the latest lines."""
    latest = list(lines)[-int(STATUS_LINE["lines"]) :]
    parts = [
        *([f"{STATUS_LINE['summary_heading']}\n{summary.strip()}"] if summary.strip() else []),
        *([f"{STATUS_LINE['lines_heading']}\n" + "\n".join(latest)] if latest else []),
    ]
    return [{"role": "system", "content": str(STATUS_LINE["prompt"])}, {"role": "user", "content": "\n\n".join(parts)}]


def status_clean(text: str) -> str:
    """The model's answer as a status line: its first line, unquoted, without dashes, at most the limit."""
    first = next((line for line in text.split("\n") if line.strip()), "").strip()
    unquoted = re.sub(r"^[\"“'‘]+|[\"”'’]+$", "", first).strip()  # noqa: RUF001
    plain = re.sub(r"\s+", " ", plain_dashes(unquoted))
    limit = int(STATUS_LINE["characters"])
    if len(plain) <= limit:
        return plain
    cut = plain[: limit - 3]
    space = cut.rfind(" ")
    return re.sub(r"[\s,;:.]+$", "", cut[:space] if space > 0 else cut) + "..."
