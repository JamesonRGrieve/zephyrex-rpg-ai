# SPDX-License-Identifier: AGPL-3.0-or-later
"""Group guards (SillyTavern's name stop strings).

In a scene with several speakers, a reply ends where it starts someone else's line: "\\nName:" for the
person, then the cast, never the speaker; narrating, only the person's; writing the person's own line,
the cast's. SillyTavern's group nudge is left out (it made the lab's Cydonia 24B worse; group.ts says
how). The twin of client/src/features/chat/group.ts, held to contract/group-cases.json.
"""

import json
from collections.abc import Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "group-cases.json").read_text())


def group_stops(mode: str, speaker: str, cast: Sequence[str], person: str) -> list[str]:
    """The stop strings for one turn: ``cast`` the AI's characters, ``person`` who the person is."""
    if mode == "table":
        return []
    others = [name for name in cast if name != speaker]
    names = others if mode == "impersonate" else [person] if mode == "narrate" else [person, *others]
    unique: list[str] = []
    for name in (name.strip() for name in names):
        if name and name != speaker and name not in unique:
            unique.append(name)
    return [f"\n{name}:" for name in unique[: _CASES["max_stops"]]]
