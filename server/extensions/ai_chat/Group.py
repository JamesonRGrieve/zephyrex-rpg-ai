# SPDX-License-Identifier: AGPL-3.0-or-later
"""Group guards (SillyTavern's name stop strings).

In a scene with several speakers, a reply ends where it starts someone else's structured line ("\\nName",
say or do; PlayerLines.py): the person's seat first (its name and "*First"), then the cast's, the most
recent speakers first, never the speaker's; narrating, the seat's only; writing the person's own line,
the cast's. SillyTavern's group nudge is left out (it made the lab's Cydonia 24B
worse; group.ts says how). The twin of client/src/features/chat/group.ts, held to contract/group-cases.json.
"""

import json
from collections.abc import Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "group-cases.json").read_text())


def group_stops(mode: str, speaker: str, cast: Sequence[str], person: str, recent: Sequence[str] = ()) -> list[str]:
    """The stop strings for one turn: ``cast`` the AI's characters, ``person`` who the person is."""
    if mode == "table":
        return []
    # The most recent speakers first (the play-test: the narrator wrote "The Acolyte: ...").
    others = [name for name in [*[one for one in recent if one in cast], *cast] if name != speaker]
    seat = person.strip()
    first = seat.split()[0] if seat else ""
    # Nobody writes for the person's seat (the operator's play-test): its line-start forms come first.
    # The narrator may voice the cast only in @@Name interludes, so it stops only at the seat.
    if mode == "impersonate" or not seat:
        seat_stops: list[str] = []
    else:
        # Only the seat's structured line forms (the operator: "Things need to still happen to my character,
        # just not by my character"): prose about them goes on, and the save-time seat_cut takes what acts.
        lead = first if len(first) >= 3 and first.lower() not in ("the", "a", "an") else seat
        if mode == "narrate":
            seat_stops = [f"\n{seat} (", f"\n{seat}:", f"\n*{lead}", f"\n{lead} ("]
        else:
            seat_stops = [f"\n{seat} (", f"\n*{lead}"]
    # Structured lines (PlayerLines.py): a line opening with a name is that person's, say or do; the
    # narrator may write the cast's lines, a voice only its own.
    cast_stops = [
        f"\n{name}"
        for name in (name.strip() for name in ([] if mode == "narrate" else others))
        if name and name != speaker and name != seat
    ]
    unique: list[str] = []
    for stop in [*seat_stops, *cast_stops]:
        if stop not in unique:
            unique.append(stop)
    return unique[: _CASES["max_stops"]]
