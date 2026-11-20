# SPDX-License-Identifier: AGPL-3.0-or-later
"""What a model is given for a character's next reply: the server's twin of the client's
assemblePrompt (client/src/features/prompt/assemble.ts), held to the same cases
(contract/prompt-cases.json, run by Prompt_test.py and by the client's suite).

1. System: the speaker's system prompt (or the contract's default), then the card's description,
   personality, scenario, the persona and the example dialogue.
2. History: the branch's story messages only (``story_channels``); out-of-character table talk
   never enters the story. The speaker's lines are the assistant's; everyone else's the user's,
   named when the chat has several voices.
3. The author's note at ``author_note_depth`` messages from the end, then the speaker's
   post-history instructions last.
4. Lore (World Info, Lore.py): its sections sit around the card (``before_char``, ``after_char``),
   the examples and the author's note; its depth entries go into the history at their depth.
5. Budget: the context window less the reply's room. Oldest history goes first; the system text,
   the note, the lore and the instructions always stay.
"""

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import PROMPT  # type: ignore[import-not-found]

DEFAULT_USER_NAME = "User"
NARRATOR = "Narrator"
MACROS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\{\{\s*char\s*\}\}", re.IGNORECASE), "char"),
    (re.compile(r"\{\{\s*user\s*\}\}", re.IGNORECASE), "user"),
    (re.compile(r"<BOT>"), "char"),
    (re.compile(r"<USER>"), "user"),
)


def expand_macros(text: str, names: Mapping[str, str]) -> str:
    for pattern, name in MACROS:
        text = pattern.sub(lambda _match, value=names[name]: value, text)
    return text


def estimate_tokens(message: Mapping[str, str]) -> int:
    return math.ceil(len(message["content"]) / PROMPT["characters_per_token"]) + PROMPT["message_overhead_tokens"]


@dataclass(frozen=True)
class Assembled:
    messages: list[dict[str, str]]
    dropped: int


def _system_text(
    speaker: Mapping[str, Any], persona: Mapping[str, Any] | None, names: Mapping[str, str], lore: Mapping[str, str]
) -> str:
    sections = [
        PROMPT["default_system_prompt"] if not speaker["system_prompt"].strip() else speaker["system_prompt"],
        lore.get("before_char", ""),
        speaker["description"],
        f"{{{{char}}}}'s personality: {speaker['personality']}" if speaker["personality"].strip() else "",
        f"Scenario: {speaker['scenario']}" if speaker["scenario"].strip() else "",
        lore.get("after_char", ""),
        f"{{{{user}}}}: {persona['description']}" if persona is not None and persona["description"].strip() else "",
        lore.get("before_example", ""),
        f"Example dialogue:\n{speaker['example_messages']}" if speaker["example_messages"].strip() else "",
        lore.get("after_example", ""),
    ]
    return expand_macros("\n\n".join(section.strip() for section in sections if section.strip()), names)


def _history_message(
    turn: Mapping[str, Any], speaker_id: str, names_by_id: Mapping[str, str], group: bool, user_name: str
) -> dict[str, str]:
    if turn["role"] == "character" and turn["speaker_character_id"] == speaker_id:
        return {"role": "assistant", "content": turn["content"]}
    if turn["role"] == "system" or turn["channel"] == "roll":
        return {"role": "system", "content": turn["content"]}
    if turn["role"] == "narrator":
        name = NARRATOR
    elif turn["role"] == "user":
        name = user_name
    else:
        name = names_by_id.get(turn["speaker_character_id"] or "", NARRATOR)
    named = group or turn["role"] != "user"
    return {"role": "user", "content": f"{name}: {turn['content']}" if named else turn["content"]}


def assemble_prompt(
    characters: Sequence[Mapping[str, Any]],
    speaker_id: str,
    persona: Mapping[str, Any] | None,
    author_note: str,
    history: Sequence[Mapping[str, Any]],
    context_tokens: int,
    max_tokens: int,
    lore: Mapping[str, Any] | None = None,
) -> Assembled:
    speaker = next((character for character in characters if character["id"] == speaker_id), None)
    if speaker is None:
        raise ValueError("The speaker must be one of the chat’s characters")
    names = {"char": speaker["name"], "user": persona["name"] if persona is not None else DEFAULT_USER_NAME}
    names_by_id = {character["id"]: character["name"] for character in characters}
    group = len(characters) > 1
    story = set(PROMPT["story_channels"])

    sections: Mapping[str, str] = (lore or {}).get("sections", {})
    system = {"role": "system", "content": _system_text(speaker, persona, names, sections)}
    block = "\n".join(
        part.strip()
        for part in (sections.get("before_an", ""), author_note, sections.get("after_an", ""))
        if part.strip()
    )
    note = expand_macros(block, names)
    inserts: list[tuple[int, dict[str, str]]] = [(PROMPT["author_note_depth"], {"role": "system", "content": note})] if note else []
    inserts += [
        (insert["depth"], {"role": insert["role"], "content": expand_macros(insert["content"], names)})
        for insert in (lore or {}).get("at_depth", [])
    ]
    after = (
        [{"role": "system", "content": expand_macros(speaker["post_history_instructions"], names)}]
        if speaker["post_history_instructions"].strip()
        else []
    )
    turns = [
        _history_message(turn, speaker["id"], names_by_id, group, names["user"]) for turn in history if turn["channel"] in story
    ]

    budget = context_tokens - max_tokens
    used = sum(estimate_tokens(message) for message in [system, *after, *(message for _depth, message in inserts)])
    kept = len(turns)
    for index in range(len(turns) - 1, -1, -1):
        cost = used + estimate_tokens(turns[index])
        if cost > budget:
            break
        used = cost
        kept = index
    window = turns[kept:]
    placed: list[dict[str, str]] = []
    for index in range(len(window) + 1):
        placed += [message for depth, message in inserts if max(0, len(window) - depth) == index]
        if index < len(window):
            placed.append(window[index])
    return Assembled(messages=[system, *placed, *after], dropped=kept)
