# SPDX-License-Identifier: AGPL-3.0-or-later
"""The person's last line goes last (Self Hosted AI, 2026-11-21: the Mistral-family Ollama template renders
system messages only on a final user turn): on the wire to a chat API, every system message after the
last user turn moves to just before it, in order.

The twin of client/src/features/prompt/systemOrder.ts, held to contract/system-order-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

M = TypeVar("M", bound=Mapping[str, Any])


def systems_before_last_user(messages: Sequence[M]) -> list[M]:
    """Every system message after the last user turn, moved to just before it; else as it was."""
    users = [index for index, message in enumerate(messages) if message["role"] == "user"]
    if not users:
        return list(messages)
    last = users[-1]
    after = list(messages[last + 1 :])
    moved = [message for message in after if message["role"] == "system"]
    if not moved:
        return list(messages)
    return [*messages[:last], *moved, messages[last], *[message for message in after if message["role"] != "system"]]
