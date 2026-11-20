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
Modes: ``reply`` (the next character turn), ``continue`` (the last message is the character's own and
the model carries on, so the post-history instructions go before it) and ``impersonate`` (the
person's own next line, asked for by the contract's instruction at the end).

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
from zephyrex.extensions.ai_chat.Regex import apply_regex  # type: ignore[import-not-found]

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


def prompt_layout(given: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]]:
    """The prompt manager's layout (A16): the given sections in their order (unknown and repeated
    ones dropped), then any section it leaves out, on, in the contract's order."""
    known = PROMPT["sections"]
    layout: list[dict[str, Any]] = []
    for section in given or []:
        if section.get("id") in known and all(kept["id"] != section["id"] for kept in layout):
            layout.append({"id": section["id"], "enabled": bool(section.get("enabled", True)), "max_tokens": section.get("max_tokens")})
    return layout + [{"id": id_, "enabled": True, "max_tokens": None} for id_ in known if all(kept["id"] != id_ for kept in layout)]


def _capped(text: str, max_tokens: int | None) -> str:
    """A section cut to its token budget (characters at the contract's ratio), whitespace trimmed."""
    text = text.strip()
    if max_tokens is None:
        return text
    return text[: max_tokens * PROMPT["characters_per_token"]].rstrip()


def _system_text(texts: Mapping[str, str], layout: Sequence[Mapping[str, Any]], names: Mapping[str, str]) -> str:
    # Each section is cut to its budget once its macros are filled in: the budget is what the model reads.
    parts = [
        _capped(expand_macros(texts[section["id"]], names), section["max_tokens"])
        for section in layout
        if section["enabled"] and section["id"] in texts
    ]
    return "\n\n".join(part for part in parts if part)


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
    mode: str = "reply",
    layout: Sequence[Mapping[str, Any]] | None = None,
    system_prompt: str = "",
    summary: str = "",
    regex: Sequence[Mapping[str, Any]] = (),
) -> Assembled:
    speaker = next((character for character in characters if character["id"] == speaker_id), None)
    if speaker is None:
        raise ValueError("The speaker must be one of the chat’s characters")
    names = {"char": speaker["name"], "user": persona["name"] if persona is not None else DEFAULT_USER_NAME}
    names_by_id = {character["id"]: character["name"] for character in characters}
    group = len(characters) > 1
    story = set(PROMPT["story_channels"])

    sections: Mapping[str, str] = (lore or {}).get("sections", {})
    arranged = {section["id"]: section for section in prompt_layout(layout)}
    order = list(arranged.values())

    def kept(id_: str, text: str) -> str:
        section = arranged[id_]
        return _capped(expand_macros(text, names), section["max_tokens"]) if section["enabled"] else ""

    main = system_prompt if system_prompt.strip() else speaker["system_prompt"] if speaker["system_prompt"].strip() else PROMPT["default_system_prompt"]
    texts = {
        "main": main,
        "lore_before_char": sections.get("before_char", ""),
        "description": speaker["description"],
        "personality": f"{{{{char}}}}'s personality: {speaker['personality']}" if speaker["personality"].strip() else "",
        "scenario": f"Scenario: {speaker['scenario']}" if speaker["scenario"].strip() else "",
        "lore_after_char": sections.get("after_char", ""),
        "persona": f"{{{{user}}}}: {persona['description']}" if persona is not None and persona["description"].strip() else "",
        "lore_before_example": sections.get("before_example", ""),
        "examples": f"Example dialogue:\n{speaker['example_messages']}" if speaker["example_messages"].strip() else "",
        "lore_after_example": sections.get("after_example", ""),
        "summary": PROMPT["summary_prefix"] + summary if summary.strip() else "",
    }
    system = {"role": "system", "content": _system_text(texts, order, names)}
    block = "\n".join(
        part.strip()
        for part in (sections.get("before_an", ""), kept("author_note", author_note), sections.get("after_an", ""))
        if part.strip()
    )
    note = expand_macros(block, names)
    inserts: list[tuple[int, dict[str, str]]] = [(PROMPT["author_note_depth"], {"role": "system", "content": note})] if note else []
    inserts += [
        (insert["depth"], {"role": insert["role"], "content": expand_macros(insert["content"], names)})
        for insert in (lore or {}).get("at_depth", [])
    ]
    instructions = kept("post_history", speaker["post_history_instructions"])
    after = [{"role": "system", "content": expand_macros(instructions, names)}] if instructions else []
    if mode == "impersonate":
        after.append({"role": "system", "content": expand_macros(PROMPT["impersonate_prompt"], names)})
    story_turns = [turn for turn in history if turn["channel"] in story]
    # Prompt-only regex scripts (A33) rewrite what the model reads, by each turn's depth (0 = newest).
    placements = {"user": "user_input", "character": "ai_output"}
    story_turns = [
        {**turn, "content": apply_regex(turn["content"], regex, placements[turn["role"]], "prompt", len(story_turns) - 1 - index)}
        if turn["role"] in placements
        else turn
        for index, turn in enumerate(story_turns)
    ]
    turns = [_history_message(turn, speaker["id"], names_by_id, group, names["user"]) for turn in story_turns]

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
    if mode == "continue" and placed and placed[-1]["role"] == "assistant":
        return Assembled(messages=[system, *placed[:-1], *after, placed[-1]], dropped=kept)
    return Assembled(messages=[system, *placed, *after], dropped=kept)


def summary_prompt(
    characters: Sequence[Mapping[str, Any]],
    persona: Mapping[str, Any] | None,
    history: Sequence[Mapping[str, Any]],
    context_tokens: int,
    max_tokens: int,
) -> Assembled:
    """What a model is asked to summarise a branch (A19): the contract's instruction, then the
    story so far as one transcript, every turn named. Out-of-character talk stays out; when the
    transcript outgrows the window, its oldest turns are dropped."""
    user_name = persona["name"] if persona is not None else DEFAULT_USER_NAME
    names_by_id = {character["id"]: character["name"] for character in characters}
    lines = []
    for turn in history:
        if turn["channel"] not in PROMPT["story_channels"]:
            continue
        if turn["role"] == "user":
            name = user_name
        elif turn["role"] == "character":
            name = names_by_id.get(turn["speaker_character_id"] or "", NARRATOR)
        else:
            name = NARRATOR
        lines.append(f"{name}: {turn['content']}")
    instruction = {"role": "system", "content": PROMPT["summarize_prompt"]}
    budget = context_tokens - max_tokens - estimate_tokens(instruction) - PROMPT["message_overhead_tokens"]
    kept = len(lines)
    used = 0
    for index in range(len(lines) - 1, -1, -1):
        # A line costs its characters and the newline joining it.
        cost = used + math.ceil((len(lines[index]) + 1) / PROMPT["characters_per_token"])
        if cost > budget:
            break
        used = cost
        kept = index
    return Assembled(messages=[instruction, {"role": "user", "content": "\n".join(lines[kept:])}], dropped=kept)

