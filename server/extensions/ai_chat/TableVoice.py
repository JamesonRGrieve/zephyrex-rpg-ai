# SPDX-License-Identifier: AGPL-3.0-or-later
"""The table GM's own voice, guarded (contract table.voice; the operator, 2026-11-23: prod chat b93b668e
answered an out-of-game question as "Sergeant Horvec: …" and as "Understood. I'll pause here…").

An answer that opens with a speaker's label, or as an assistant, is flagged. The client then asks again
with forbid {reason: "table_voice", note}, which the table GM's prompt reads (forbid_text). The twin of
client/src/lib/tableVoice.ts, held to contract/table-voice-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

VOICE: dict[str, Any] = CONTRACT["table"]["voice"]
# A label's words: capitalised, with apostrophes (straight or curly, \u2019), dots and hyphens.
_LABEL = re.compile(r"^\s*([A-Z][\w'\u2019.-]*(?: [A-Z][\w'\u2019.-]*){0,4})\s*:\s+\S")


def _answer(text: str) -> str:
    from zephyrex.extensions.ai_chat.Prompt import story_text  # type: ignore[import-not-found]

    return str(story_text(text)).strip()


def table_voice_problem(text: str) -> dict[str, Any] | None:
    """``{kind: "npc", name}`` when the answer opens as a character (a ``Name:`` label other than the GM's
    own), ``{kind: "assistant", name: None}`` when it opens as an assistant, else None."""
    answer = _answer(text)
    first = next((line for line in answer.split("\n") if line.strip()), "")
    label = _LABEL.match(first)
    allowed = {str(one).lower() for one in VOICE["allowed_labels"]}
    if label is not None and label.group(1).lower() not in allowed:
        return {"kind": "npc", "name": label.group(1)}
    opening = first.strip().lower()
    if any(opening.startswith(str(word)) for word in VOICE["assistant_openings"]):
        return {"kind": "assistant", "name": None}
    return None


def table_voice_note(problem: Mapping[str, Any]) -> str:
    """What the retry is told: the wrong voice, by name when it was a character."""
    if problem.get("kind") == "npc":
        return str(VOICE["npc_note"]).replace("{{name}}", str(problem.get("name") or "someone"))
    return str(VOICE["assistant_note"])


def story_voice_problem(text: str) -> dict[str, Any] | None:
    """A story turn's voice gone out of the story (live run 4, chat aa050327: "I'll roll for both
    characters … I'll describe their actions next.", credited to "User"): a reply that opens as an
    assistant or as the player's helper, or under a User/Assistant label. A character's ``Name:`` label
    is a story turn's own form, so it is never flagged here."""
    answer = _answer(text)
    first = next((line for line in answer.split("\n") if line.strip()), "")
    label = _LABEL.match(first)
    if label is not None and label.group(1).lower() in {str(one).lower() for one in VOICE["story_labels"]}:
        return {"kind": "assistant", "name": label.group(1)}
    opening = first.strip().lower()
    if any(opening.startswith(str(word)) for word in [*VOICE["assistant_openings"], *VOICE["agent_openings"]]):
        return {"kind": "assistant", "name": None}
    return None


def story_voice_note() -> str:
    """What a story turn's retry is told."""
    return str(VOICE["story_note"])
