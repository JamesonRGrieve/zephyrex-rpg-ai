# SPDX-License-Identifier: AGPL-3.0-or-later
"""The play model's rules (docs/DESIGN.md, The play model; the operator, 2026-11-21).

A campaign's story is one tree; sessions are its segments, save points that compact earlier play
into summaries; the person's seat hot-swaps to the GM or any character. The twin of
client/src/features/chat/play.ts, held to contract/play-cases.json:

- what a reply reads: the current session's lines only, earlier sessions by their summaries;
- who the person is: the character they play, else their persona;
- who the AI plays: the party, less the character the person plays.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "play-cases.json").read_text())
SESSION_HEADING: str = _CASES["session_heading"]


def session_start_index(path: Sequence[str], sessions: Sequence[Mapping[str, Any]]) -> int:
    """Where the history starts on a branch (message ids, oldest first): the latest session on it, else 0."""
    at = {message_id: index for index, message_id in enumerate(path)}
    start, latest = 0, None
    for session in sessions:
        index = at.get(session["start_message_id"])
        if index is not None and (latest is None or session["number"] > latest):
            latest, start = session["number"], index
    return start


def sessions_summary(path: Sequence[str], sessions: Sequence[Mapping[str, Any]]) -> str:
    """The summaries of the sessions before the current one, in order, each under its heading."""
    at = {message_id: index for index, message_id in enumerate(path)}
    start = session_start_index(path, sessions)
    earlier = sorted(
        (
            session
            for session in sessions
            if at.get(session["start_message_id"]) is not None
            and at[session["start_message_id"]] < start
            and str(session.get("summary", "")).strip()
        ),
        key=lambda session: session["number"],
    )
    return "\n\n".join(
        f"{SESSION_HEADING.replace('{n}', str(session['number']))}\n{str(session['summary']).strip()}"
        for session in earlier
    )


def played_persona(playing: Mapping[str, Any] | None, persona: Mapping[str, Any] | None) -> Mapping[str, Any] | None:
    """Who the person is in the prompt: the character they play, else their persona."""
    if playing is None:
        return persona
    return {"name": playing["name"], "description": playing["description"]}


def ai_cast(party: Sequence[str], playing_id: str | None) -> list[str]:
    """The characters the AI plays: the party, less the one the person plays."""
    return [character_id for character_id in party if character_id != playing_id]
