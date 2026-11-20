# SPDX-License-Identifier: AGPL-3.0-or-later
"""Instruct templates (A17): a chat-completion message list as the one prompt string a
text-completion model reads, in the template's own markup (ChatML, Llama 3, Alpaca, Mistral; the
contract's ``instruct_templates``). The twin of client/src/features/prompt/instruct.ts, held to
contract/instruct-cases.json.

Each message is its role's prefix, its content and its role's suffix, after the template's
``start``. The prompt ends with the assistant's prefix, for the model to write the reply; when
continuing (``open_last``) a closing assistant message is left open instead, without its suffix.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

TEMPLATES: Mapping[str, Mapping[str, Any]] = CONTRACT["instruct_templates"]


def render_instruct(messages: Sequence[Mapping[str, str]], template_id: str, open_last: bool = False) -> str:
    template = TEMPLATES[template_id]
    closing = messages[-1] if messages else None
    left_open = open_last and closing is not None and closing["role"] == "assistant"
    body = messages[:-1] if left_open else messages
    text = template["start"] + "".join(
        f"{template[message['role'] + '_prefix']}{message['content']}{template[message['role'] + '_suffix']}" for message in body
    )
    if left_open and closing is not None:
        return text + template["assistant_prefix"] + closing["content"]
    return text + template["assistant_prefix"]


def instruct_stops(template_id: str) -> list[str]:
    return list(TEMPLATES[template_id]["stop"])
