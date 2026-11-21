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

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

TEMPLATES: Mapping[str, Mapping[str, Any]] = CONTRACT["instruct_templates"]


def template_of(template: str | Mapping[str, Any]) -> Mapping[str, Any]:
    """A built-in template by its id, or a person's own (A17) as its fields."""
    return TEMPLATES[template] if isinstance(template, str) else template


def render_instruct(
    messages: Sequence[Mapping[str, str]], template_id: str | Mapping[str, Any], open_last: bool = False
) -> str:
    template = template_of(template_id)
    closing = messages[-1] if messages else None
    left_open = open_last and closing is not None and closing["role"] == "assistant"
    body = messages[:-1] if left_open else messages
    text = template["start"] + "".join(
        f"{template[message['role'] + '_prefix']}{message['content']}{template[message['role'] + '_suffix']}"
        for message in body
    )
    if left_open and closing is not None:
        return text + template["assistant_prefix"] + closing["content"]
    return text + template["assistant_prefix"]


def instruct_stops(template_id: str | Mapping[str, Any]) -> list[str]:
    return list(template_of(template_id)["stop"])


STORY_FIELDS = (
    "system",
    "description",
    "personality",
    "scenario",
    "persona",
    "wiBefore",
    "wiAfter",
    "loreBefore",
    "loreAfter",
    "mesExamples",
)
_IF_BLOCK = re.compile(r"\{\{#if\s+(\w+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{/if\}\}")
_PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def render_story_string(story: str, values: Mapping[str, str]) -> str:
    """A context template's story string (audit gap 4), SillyTavern's Handlebars subset: ``{{#if x}}…
    {{/if}}`` keeps its text when ``x`` has some (innermost first), then ``{{x}}`` is ``x``'s text.
    Only the story's own names are filled here; the other macros are left for the macro pass."""

    def has(name: str) -> bool:
        return name in STORY_FIELDS and bool((values.get(name) or "").strip())

    text = story
    while (match := _IF_BLOCK.search(text)) is not None:
        text = text[: match.start()] + (match.group(2) if has(match.group(1)) else "") + text[match.end() :]
    return _PLACEHOLDER.sub(
        lambda match: (values.get(match.group(1)) or "") if match.group(1) in STORY_FIELDS else match.group(0), text
    )


def active_template(model: str, templates: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    """The person's own template whose activation regex matches the model's name (audit gap 4), the
    first by name; none when none does. A pattern that doesn't compile never matches."""
    for template in sorted(templates, key=lambda one: str(one["name"])):
        pattern = str(template.get("activation_regex") or "")
        if not pattern.strip():
            continue
        try:
            if re.search(pattern, model):
                return template
        except re.error:
            continue
    return None
