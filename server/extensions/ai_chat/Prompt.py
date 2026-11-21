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
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

# Resolves only at runtime, through the extensions namespace path.
from zephyrex.extensions.ai_character.Contract import CONTRACT, PROMPT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Macros import MacroContext, expand_all, expand_macros  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Regex import apply_regex  # type: ignore[import-not-found]

DEFAULT_USER_NAME = "User"
NARRATOR = "Narrator"


def estimate_tokens(message: Mapping[str, str]) -> int:
    return math.ceil(len(message["content"]) / PROMPT["characters_per_token"]) + PROMPT["message_overhead_tokens"]


@dataclass(frozen=True)
class Assembled:
    messages: list[dict[str, str]]
    dropped: int
    # The chat's and the global variables after the prompt's macros set them (assemble_prompt only).
    variables: dict[str, dict[str, str]] | None = None
    # "Start reply with" (audit gap 3): the last message's text, which the stored reply begins with.
    prefill: str | None = None


def prompt_layout(given: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]]:
    """The prompt manager's layout (A16): the given sections in their order (unknown and repeated
    ones dropped), then any section it leaves out, on, in the contract's order."""
    known = PROMPT["sections"]
    layout: list[dict[str, Any]] = []
    for section in given or []:
        if section.get("id") in known and all(kept["id"] != section["id"] for kept in layout):
            layout.append(
                {
                    "id": section["id"],
                    "enabled": bool(section.get("enabled", True)),
                    "max_tokens": section.get("max_tokens"),
                }
            )
    return layout + [
        {"id": id_, "enabled": True, "max_tokens": None} for id_ in known if all(kept["id"] != id_ for kept in layout)
    ]


OWN_PROMPT_PREFIX = "custom:"


def own_prompt_of(entry: Mapping[str, Any]) -> dict[str, Any] | None:
    """A layout entry as a person's own prompt (audit gap 3), or None when it isn't one or can't be
    used: in the system message at its place in the order, or a message of its role at a depth."""
    prompt_id, content = entry.get("id"), entry.get("content")
    if not isinstance(prompt_id, str) or not prompt_id.startswith(OWN_PROMPT_PREFIX) or not isinstance(content, str):
        return None
    depth, budget = entry.get("depth"), entry.get("max_tokens")
    name = entry.get("name")
    return {
        "id": prompt_id,
        "name": name if isinstance(name, str) else prompt_id[len(OWN_PROMPT_PREFIX) :],
        "content": content,
        "role": entry.get("role") if entry.get("role") in ("user", "assistant") else "system",
        "position": "depth" if entry.get("position") == "depth" else "system",
        "depth": depth if isinstance(depth, int) and not isinstance(depth, bool) and depth >= 0 else 0,
        "enabled": entry.get("enabled") is not False,
        "max_tokens": budget if isinstance(budget, int | float) and not isinstance(budget, bool) else None,
    }


def prefill_of(given: Sequence[Mapping[str, Any]] | None) -> str:
    """The layout's "start reply with" text (audit gap 3), when it has one turned on."""
    entry = next((one for one in given or [] if one.get("id") == "prefill"), None)
    content = entry.get("content") if entry is not None else None
    return content if entry is not None and entry.get("enabled") is not False and isinstance(content, str) else ""


def prompt_order(given: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]]:
    """The system message's order: the given sections and the person's own system prompts in the
    layout's order (repeats dropped, at most the contract's number of own prompts), then the sections
    it leaves out, on."""
    known = PROMPT["sections"]
    order: list[dict[str, Any]] = []
    own = 0
    for entry in given or []:
        entry_id = entry.get("id")
        if not isinstance(entry_id, str) or any(kept["id"] == entry_id for kept in order):
            continue
        if entry_id in known:
            budget = entry.get("max_tokens")
            order.append(
                {
                    "id": entry_id,
                    "enabled": entry.get("enabled") is not False,
                    "max_tokens": budget if isinstance(budget, int | float) and not isinstance(budget, bool) else None,
                }
            )
            continue
        prompt = own_prompt_of(entry)
        if prompt is not None and own < PROMPT["own_prompts"]:
            own += 1
            order.append(prompt)
    return order + [
        {"id": id_, "enabled": True, "max_tokens": None} for id_ in known if all(kept["id"] != id_ for kept in order)
    ]


def _capped(text: str, max_tokens: int | None) -> str:
    """A section cut to its token budget (characters at the contract's ratio), whitespace trimmed."""
    text = text.strip()
    if max_tokens is None:
        return text
    return text[: max_tokens * PROMPT["characters_per_token"]].rstrip()


def _system_text(texts: Mapping[str, str], layout: Sequence[Mapping[str, Any]], fill: Callable[[str], str]) -> str:
    # Each section is cut to its budget once its macros are filled in: the budget is what the model reads.
    # A person's own prompt in the system message sits at its place in the order (audit gap 3).
    parts = [
        _capped(fill(section["content"] if "content" in section else texts[section["id"]]), section["max_tokens"])
        for section in layout
        if section["enabled"]
        and (section.get("position") == "system" if "content" in section else section["id"] in texts)
    ]
    return "\n\n".join(part for part in parts if part)


REASONING_PAIRS: list[list[str]] = CONTRACT["reasoning"]["pairs"]


def split_reasoning(text: str) -> tuple[str, str]:
    """A reply's reasoning blocks (A45; the contract's tag pairs) and the reply without them.
    A block still open at the end (the model was cut off thinking) is reasoning to the end."""
    reasoning: list[str] = []
    reply = text
    for opening, closing in REASONING_PAIRS:
        pattern = re.compile(re.escape(opening) + r"([\s\S]*?)(?:" + re.escape(closing) + r"|$)\s*")
        reasoning += [found.strip() for found in pattern.findall(reply) if found.strip()]
        reply = pattern.sub("", reply)
    return "\n\n".join(reasoning), reply.strip()


SAFETY = CONTRACT["safety"]


def safety_text(safety: Mapping[str, Any] | None) -> str:
    """The table's safety tools as the model reads them (A25): the content rating, the lines (never
    in the story) and the veils (only off-screen). Nothing when none is set."""
    if not safety:
        return ""
    rating = safety.get("content_rating")
    lines = [line for line in safety.get("lines", []) if line.strip()]
    veils = [veil for veil in safety.get("veils", []) if veil.strip()]
    parts = [
        SAFETY["rating_text"][rating] if rating in SAFETY["rating_text"] else "",
        SAFETY["lines_prefix"] + "; ".join(lines) + "." if lines else "",
        SAFETY["veils_prefix"] + "; ".join(veils) + "." if veils else "",
    ]
    kept = [part for part in parts if part]
    return "\n".join([SAFETY["heading"], *kept]) if kept else ""


TABLE = CONTRACT["table"]


def table_notes_text(notes: Sequence[Mapping[str, Any]] | None) -> str:
    """The table's notes as the model reads them (A11): one labelled line each, under a heading."""
    kept = [
        f"{TABLE['note_labels'][note['kind']]}: {note['text'].strip()}"
        for note in notes or []
        if note["kind"] in TABLE["note_labels"] and note["text"].strip()
    ]
    return "\n".join([TABLE["notes_heading"], *kept]) if kept else ""


CAMPAIGN = CONTRACT["campaign"]


def _dial(dial: Mapping[str, str], value: int) -> str:
    if value == 0:
        return ""
    side = dial["left"] if value < 0 else dial["right"]
    return f"{'very' if abs(value) >= 2 else 'somewhat'} {side}"


def gm_style_text(frame: Mapping[str, Any] | None) -> str:
    """The campaign's GM style (A20), for the GM's own voices only (narration and the table GM);
    nothing when there is none. Character replies never read it (frame_text leaves it out)."""
    style = str((frame or {}).get("gm_style") or "").strip()
    return CAMPAIGN["gm_style_prefix"] + style if style else ""


def frame_text(frame: Mapping[str, Any] | None) -> str:
    """A campaign's frame as the model reads it (A57): the table's agreement, part by part; parts
    left empty are left out, and nothing when there is no frame."""
    if not frame:
        return ""
    dials = frame.get("dials") or {}
    tone = [_dial(dial, int(dials.get(dial["id"], 0))) for dial in CAMPAIGN["dials"]]
    pillars = frame.get("pillars") or {}
    weights = [
        f"{pillar} ({CAMPAIGN['pillar_words'][int(pillars[pillar])]})"
        for pillar in CAMPAIGN["pillars"]
        if int(pillars.get(pillar, 0)) > 0
    ]
    themes = [theme.strip() for theme in frame.get("themes") or [] if theme.strip()]
    truths = [truth.strip() for truth in frame.get("truths") or [] if truth.strip()]
    structure = frame.get("structure")
    lines = [
        f"Premise: {frame['premise'].strip()}" if (frame.get("premise") or "").strip() else "",
        f"Genre: {frame['genre'].strip()}" if (frame.get("genre") or "").strip() else "",
        "Tone: " + "; ".join(part for part in tone if part) + "." if any(tone) else "",
        "Themes: " + "; ".join(themes) + "." if themes else "",
        "Weight of play: " + ", ".join(weights) + "." if weights else "",
        f"Structure: {CAMPAIGN['structure_words'][structure]}." if structure in CAMPAIGN["structure_words"] else "",
        "Setting truths:\n" + "\n".join(f"- {truth}" for truth in truths) if truths else "",
        f"The characters: {frame['characters'].strip()}" if (frame.get("characters") or "").strip() else "",
        f"Resolution: {frame['resolution_mode']}."
        if frame.get("resolution_mode") in CAMPAIGN["resolution_modes"]
        else "",
    ]
    kept = [line for line in lines if line]
    return "\n".join([CAMPAIGN["heading"], *kept]) if kept else ""


SCENARIO = CONTRACT["scenario"]


def scenario_text(scenario: Mapping[str, Any] | None) -> str:
    """A running scenario as the GM sees it (A59, A60): what is going on, who wants what, the clocks
    (those about to fill flagged), each secret with its clues found or not, the beats still to come
    and how it can end. Parts left empty are left out; nothing when there is no scenario."""
    if not scenario:
        return ""

    def said(key: str) -> str:
        return (scenario.get(key) or "").strip()

    cast = [
        f"- {person['name'].strip()}"
        + (f" ({person['disposition'].strip()})" if (person.get("disposition") or "").strip() else "")
        + (f": wants {person['agenda'].strip()}" if (person.get("agenda") or "").strip() else "")
        + (f". Secret: {person['secret'].strip()}" if (person.get("secret") or "").strip() else "")
        for person in scenario.get("cast") or []
        if (person.get("name") or "").strip()
    ]
    places = [place.strip() for place in scenario.get("places") or [] if place.strip()]
    clocks = []
    for clock in scenario.get("clocks") or []:
        filled, segments = int(clock["filled"]), int(clock["segments"])
        state = (
            "full"
            if filled >= segments
            else "close to filling"
            if segments - filled <= SCENARIO["close_segments"]
            else ""
        )
        clocks.append(
            f"- {clock['name'].strip()}: {min(filled, segments)}/{segments}"
            + (f" ({state})" if state else "")
            + (f"; advances when {clock['advances'].strip()}" if (clock.get("advances") or "").strip() else "")
            + (f"; when full: {clock['when_full'].strip()}" if (clock.get("when_full") or "").strip() else "")
        )
    secrets = []
    for secret in scenario.get("secrets") or []:
        clues = [
            f"{clue['text'].strip()} ({'found' if clue['found'] else 'not found'})"
            for clue in secret.get("clues") or []
            if clue["text"].strip()
        ]
        found = any(clue["found"] for clue in secret.get("clues") or [])
        secrets.append(
            f"- {secret['truth'].strip()} [{'learned' if found else 'not yet learned'}]"
            + (f". Clues: {'; '.join(clues)}" if clues else "")
        )
    beats = [beat["text"].strip() for beat in scenario.get("beats") or [] if not beat["done"] and beat["text"].strip()]
    outcomes = [outcome.strip() for outcome in scenario.get("outcomes") or [] if outcome.strip()]
    lines = [
        f"Premise: {said('premise')}" if said("premise") else "",
        f"Hook: {said('hook')}" if said("hook") else "",
        f"Stakes: {said('stakes')}" if said("stakes") else "",
        f"Situation: {said('situation')}" if said("situation") else "",
        "Cast:\n" + "\n".join(cast) if cast else "",
        "Places: " + "; ".join(places) + "." if places else "",
        "Clocks:\n" + "\n".join(clocks) if clocks else "",
        "Secrets and clues:\n" + "\n".join(secrets) if secrets else "",
        "Beats still to come: " + "; ".join(beats) + "." if beats else "",
        "It can end: " + "; ".join(outcomes) + "." if outcomes else "",
    ]
    kept = [line for line in lines if line]
    return "\n".join([SCENARIO["heading"], *kept]) if kept else ""


def character_note(character: Mapping[str, Any]) -> dict[str, Any] | None:
    """The Character's Note (SillyTavern's depth prompt, V2 ``extensions.depth_prompt``).

    The speaker's own line at a depth in the history, with its role. Depth 4 and the system role
    when unset, as SillyTavern's defaults; None when the card has none. The twin of assemble.ts's
    ``characterNote``.
    """
    note = (character.get("extensions") or {}).get("depth_prompt")
    if not isinstance(note, Mapping):
        return None
    prompt = note.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return None
    depth = note.get("depth")
    role = note.get("role")
    return {
        "content": prompt,
        "depth": depth
        if isinstance(depth, int) and not isinstance(depth, bool) and depth >= 0
        else PROMPT["author_note_depth"],
        "role": role if role in ("user", "assistant") else "system",
    }


def _history_message(
    turn: Mapping[str, Any],
    speaker_id: str,
    names_by_id: Mapping[str, str],
    group: bool,
    user_name: str,
    narrating: bool = False,
) -> dict[str, str]:
    if turn["role"] == "character" and any(opening in turn["content"] for opening, _closing in REASONING_PAIRS):
        # A model's reasoning is never read back to it (A45).
        turn = {**turn, "content": split_reasoning(turn["content"])[1]}
    if turn["role"] == "character" and turn["speaker_character_id"] == speaker_id:
        return {"role": "assistant", "content": turn["content"]}
    if turn["role"] == "system" or turn["channel"] == "roll":
        return {"role": "system", "content": turn["content"]}
    if narrating and turn["role"] == "narrator":
        # The narrator's own past narration is its own voice.
        return {"role": "assistant", "content": turn["content"]}
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
    objective: str = "",
    data_bank: str = "",
    safety: Mapping[str, Any] | None = None,
    table_notes: Sequence[Mapping[str, Any]] | None = None,
    frame: Mapping[str, Any] | None = None,
    scenario: Mapping[str, Any] | None = None,
    memories: str = "",
    macros: Mapping[str, Any] | None = None,
) -> Assembled:
    narrating = mode == "narrate"
    # Narrating (A20), the GM speaks: no character is the speaker, and every character is named.
    speaker = (
        {
            key: ""
            for key in (
                "id",
                "description",
                "personality",
                "scenario",
                "example_messages",
                "system_prompt",
                "post_history_instructions",
            )
        }
        | {"name": PROMPT["narrator_name"]}
        if narrating
        else next((character for character in characters if character["id"] == speaker_id), None)
    )
    if speaker is None:
        raise ValueError("The speaker must be one of the chat's characters")
    user_name = persona["name"] if persona is not None else DEFAULT_USER_NAME
    names = {"char": speaker["name"], "user": user_name}
    # Every macro in the prompt (audit gap 1), filled in order, the variables carried from one to the
    # next. ``macros`` holds what they read beyond the names (MacroContext's other fields).
    given = dict(macros or {})
    variables = {"local": dict(given.pop("local", {}) or {}), "global": dict(given.pop("global_", {}) or {})}

    def fill(text: str, as_: Mapping[str, str] | None = None) -> str:
        filled = expand_all(
            text,
            MacroContext(names=as_ or names, local=variables["local"], global_=variables["global"], **given),
        )
        variables["local"], variables["global"] = filled.local, filled.global_
        text_out: str = filled.text
        return text_out

    names_by_id = {character["id"]: character["name"] for character in characters}
    group = len(characters) > 1 or narrating
    story = set(PROMPT["story_channels"])

    sections: Mapping[str, str] = (lore or {}).get("sections", {})
    arranged = {section["id"]: section for section in prompt_layout(layout)}
    order = prompt_order(layout)

    def kept(id_: str, text: str) -> str:
        section = arranged[id_]
        return _capped(fill(text), section["max_tokens"]) if section["enabled"] else ""

    if system_prompt.strip():
        main = system_prompt
    elif narrating:
        main = "\n\n".join(part for part in (PROMPT["narrate_prompt"], gm_style_text(frame)) if part)
    else:
        main = speaker["system_prompt"] if speaker["system_prompt"].strip() else PROMPT["default_system_prompt"]
    # The narrator reads every character, in brief: each one's description with its own name filled in.
    cast_text = "\n".join(
        [PROMPT["cast_heading"]]
        + [
            f"- {character['name']}: "
            + fill(character["description"].strip(), {"char": character["name"], "user": user_name})
            for character in characters
            if character["description"].strip()
        ]
    )
    texts = {
        "main": main,
        "safety": safety_text(safety),
        "table_notes": table_notes_text(table_notes),
        "campaign": frame_text(frame),
        "running_scenario": scenario_text(scenario),
        "lore_before_char": sections.get("before_char", ""),
        "description": cast_text
        if narrating and any(character["description"].strip() for character in characters)
        else speaker["description"],
        "personality": f"{{{{char}}}}'s personality: {speaker['personality']}"
        if speaker["personality"].strip()
        else "",
        "scenario": f"Scenario: {speaker['scenario']}" if speaker["scenario"].strip() else "",
        "lore_after_char": sections.get("after_char", ""),
        "persona": f"{{{{user}}}}: {persona['description']}"
        if persona is not None and persona["description"].strip()
        else "",
        "lore_before_example": sections.get("before_example", ""),
        "examples": f"Example dialogue:\n{speaker['example_messages']}" if speaker["example_messages"].strip() else "",
        "lore_after_example": sections.get("after_example", ""),
        # The data bank's retrieved notes (A41, DataBank.py), as one section.
        "data_bank": data_bank,
        # The chat's older lines recalled by meaning (A19, Remembering.py), as one section.
        "memories": memories,
        "summary": PROMPT["summary_prefix"] + summary if summary.strip() else "",
    }
    system = {"role": "system", "content": _system_text(texts, order, fill)}
    block = "\n".join(
        part.strip()
        for part in (sections.get("before_an", ""), kept("author_note", author_note), sections.get("after_an", ""))
        if part.strip()
    )
    note = fill(block)
    inserts: list[tuple[int, dict[str, str]]] = (
        [(PROMPT["author_note_depth"], {"role": "system", "content": note})] if note else []
    )
    # The speaker's Character's Note (gap 7); the narrator has none.
    card_note = None if narrating else character_note(speaker)
    if card_note is not None:
        inserts.append((card_note["depth"], {"role": card_note["role"], "content": fill(card_note["content"])}))
    inserts += [
        (insert["depth"], {"role": insert["role"], "content": fill(insert["content"])})
        for insert in (lore or {}).get("at_depth", [])
    ]
    if objective.strip():
        # The chat's current task (A53), a system line at its depth.
        task = fill(PROMPT["objective_prompt"].replace("{{task}}", objective.strip()))
        inserts.append((PROMPT["objective_depth"], {"role": "system", "content": task}))
    # The person's own prompts placed in the history (audit gap 3), each at its depth.
    for entry in order:
        if "content" in entry and entry["enabled"] and entry["position"] == "depth":
            content = _capped(fill(entry["content"]), entry["max_tokens"])
            if content:
                inserts.append((entry["depth"], {"role": entry["role"], "content": content}))
    instructions = kept("post_history", speaker["post_history_instructions"])
    # "Start reply with" (audit gap 3): the reply's opening, as the last message (not when continuing).
    prefill = "" if mode == "continue" else fill(prefill_of(layout))
    after = [{"role": "system", "content": instructions}] if instructions else []
    if mode == "impersonate":
        after.append({"role": "system", "content": fill(PROMPT["impersonate_prompt"])})
    if mode == "continue":
        # Continuing (audit gap 3): a nudge not to repeat what's there, just before the message carried on.
        after.append({"role": "system", "content": fill(PROMPT["continue_nudge"])})
    if prefill:
        after.append({"role": "assistant", "content": prefill})
    # An X-carded turn (A25) stays in the chat but out of what the model reads.
    story_turns = [turn for turn in history if turn["channel"] in story and not turn.get("x_carded", False)]
    # Prompt-only regex scripts (A33) rewrite what the model reads, by each turn's depth (0 = newest).
    placements = {"user": "user_input", "character": "ai_output"}
    story_turns = [
        {
            **turn,
            "content": apply_regex(
                turn["content"], regex, placements[turn["role"]], "prompt", len(story_turns) - 1 - index
            ),
        }
        if turn["role"] in placements
        else turn
        for index, turn in enumerate(story_turns)
    ]
    turns = [
        _history_message(turn, speaker["id"], names_by_id, group, names["user"], narrating) for turn in story_turns
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
    with_variables = variables if macros is not None else None
    if mode == "continue" and placed and placed[-1]["role"] == "assistant":
        return Assembled(
            messages=[system, *placed[:-1], *after, placed[-1]],
            dropped=kept,
            variables=with_variables,
            prefill=prefill or None,
        )
    return Assembled(
        messages=[system, *placed, *after], dropped=kept, variables=with_variables, prefill=prefill or None
    )


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
        if turn["channel"] not in PROMPT["story_channels"] or turn.get("x_carded", False):
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


def translate_prompt(text: str, language: str) -> list[dict[str, str]]:
    """What a model is asked to translate ``text`` into ``language`` (A43)."""
    return [
        {"role": "system", "content": PROMPT["translate_prompt"].replace("{{language}}", language)},
        {"role": "user", "content": text},
    ]


def table_gm_prompt(
    characters: Sequence[Mapping[str, Any]],
    persona: Mapping[str, Any] | None,
    history: Sequence[Mapping[str, Any]],
    context_tokens: int,
    max_tokens: int,
    summary: str = "",
    safety: Mapping[str, Any] | None = None,
    table_notes: Sequence[Mapping[str, Any]] | None = None,
    frame: Mapping[str, Any] | None = None,
) -> Assembled:
    """What the table GM reads to answer the players out of character (A11, A20). The system text:
    the contract's GM prompt, the safety tools, the table notes, the summary and the last few story
    turns (named, X-carded ones left out), for reference only. Then the table talk (``ooc`` and
    ``gm``) as the conversation: the players' lines as the user's, named, and the GM's (a narrator on
    the ``gm`` channel) as the assistant's. The oldest table talk is dropped to fit."""
    user_name = persona["name"] if persona is not None else DEFAULT_USER_NAME
    names_by_id = {character["id"]: character["name"] for character in characters}

    def named(turn: Mapping[str, Any]) -> str:
        if turn["role"] == "user":
            return user_name
        if turn["role"] == "character":
            return names_by_id.get(turn["speaker_character_id"] or "", NARRATOR)
        return NARRATOR

    story = [
        turn for turn in history if turn["channel"] in PROMPT["story_channels"] and not turn.get("x_carded", False)
    ]
    recent = [f"{named(turn)}: {turn['content']}" for turn in story[-TABLE["recent_story_turns"] :]]
    parts = [
        TABLE["gm_prompt"],
        TABLE["note_prompt"],
        gm_style_text(frame),
        safety_text(safety),
        table_notes_text(table_notes),
        PROMPT["summary_prefix"] + summary if summary.strip() else "",
        "\n".join([TABLE["recent_story_heading"], *recent]) if recent else "",
    ]
    system = {"role": "system", "content": "\n\n".join(part.strip() for part in parts if part.strip())}
    talk = [
        {"role": "assistant", "content": turn["content"]}
        if turn["role"] == "narrator" and turn["channel"] == "gm"
        else {"role": "user", "content": f"{named(turn)}: {turn['content']}"}
        for turn in history
        if turn["channel"] in ("ooc", "gm")
    ]
    budget = context_tokens - max_tokens - estimate_tokens(system)
    kept = len(talk)
    used = 0
    for index in range(len(talk) - 1, -1, -1):
        cost = used + estimate_tokens(talk[index])
        if cost > budget:
            break
        used = cost
        kept = index
    return Assembled(messages=[system, *talk[kept:]], dropped=kept)


EXPRESSION = CONTRACT["expression"]


def expression_prompt(line: str, options: Sequence[str]) -> list[dict[str, str]]:
    """What a model is asked to name a line's feeling (A4), choosing only from ``options``."""
    return [
        {"role": "system", "content": EXPRESSION["prompt"].replace("{{options}}", ", ".join(options))},
        {"role": "user", "content": line},
    ]


def pick_option(answer: str, options: Sequence[str]) -> str | None:
    """The option a decision model's answer names: the first option, in the answer's order, whose
    word appears in it (ignoring case); none when it names none. A model never invents one."""
    words = re.findall(r"[^\W_]+", answer.lower())
    by_word = {option.lower(): option for option in options}
    return next((by_word[word] for word in words if word in by_word), None)


PICTURE = CONTRACT["picture"]


def scene_picture_prompt(
    characters: Sequence[Mapping[str, Any]],
    persona: Mapping[str, Any] | None,
    history: Sequence[Mapping[str, Any]],
    asked: str = "",
) -> str:
    """What an image model is asked to draw (A30): the person's own words, or the last story turns
    (named; table talk and X-carded turns left out) as a scene, cut to the contract's length."""
    if asked.strip():
        return asked.strip()[: PICTURE["prompt_characters"]]
    user_name = persona["name"] if persona is not None else DEFAULT_USER_NAME
    names_by_id = {character["id"]: character["name"] for character in characters}
    story = [
        turn for turn in history if turn["channel"] in PROMPT["story_channels"] and not turn.get("x_carded", False)
    ]

    def named(turn: Mapping[str, Any]) -> str:
        if turn["role"] == "user":
            return user_name
        if turn["role"] == "character":
            return names_by_id.get(turn["speaker_character_id"] or "", NARRATOR)
        return NARRATOR

    scene = " ".join(
        f"{named(turn)}: {split_reasoning(turn['content'])[1]}" for turn in story[-PICTURE["scene_turns"] :]
    )
    return (PICTURE["scene_prefix"] + scene)[: PICTURE["prompt_characters"]]


def portrait_picture_prompt(character: Mapping[str, Any], asked: str = "") -> str:
    """What an image model is asked for a character's portrait: the person's own words, or the
    character's name and description, cut to the contract's length."""
    if asked.strip():
        return asked.strip()[: PICTURE["prompt_characters"]]
    filled = expand_macros(
        str(character.get("description") or ""), {"char": character["name"], "user": DEFAULT_USER_NAME}
    )
    description = " ".join(filled.split())
    text = PICTURE["portrait_prefix"] + character["name"] + (f". {description}" if description else "")
    return text[: PICTURE["prompt_characters"]]


def background_picture_prompt(
    characters: Sequence[Mapping[str, Any]],
    persona: Mapping[str, Any] | None,
    history: Sequence[Mapping[str, Any]],
    scenario: str,
    asked: str = "",
) -> str:
    """What an image model is asked for a chat's background: the person's own words, else the
    chat's scenario, else the last story turns, as a place with no one in it."""
    if asked.strip():
        return asked.strip()[: PICTURE["prompt_characters"]]
    setting = " ".join(scenario.split())
    place = setting if setting else scene_picture_prompt(characters, persona, history)[len(PICTURE["scene_prefix"]) :]
    return (PICTURE["background_prefix"] + place)[: PICTURE["prompt_characters"]]
