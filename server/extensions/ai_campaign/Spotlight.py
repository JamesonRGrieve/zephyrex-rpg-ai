# SPDX-License-Identifier: AGPL-3.0-or-later
"""Spotlight balance at a multiplayer table (AP7).

Over the table's last story lines, the player characters who have had the least of the players'
lines are quiet, and the GM is told to draw them in. NPC and GM lines don't count, nor
out-of-character ones. The lite twin is client/src/features/campaign/spotlight.ts; both run
contract/spotlight-cases.json.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "spotlight-cases.json").read_text())
WINDOW: int = _CASES["window"]
QUIET_SHARE: float = _CASES["quiet_share"]
MAX_NAMED: int = _CASES["max_named"]
NOTE: str = _CASES["note"]


def quiet_players(pcs: Sequence[str], lines: Sequence[Mapping[str, str]]) -> list[str]:
    """The quiet PCs, quietest first (fewest lines, then longest silent, then name), at most a few."""
    if len(pcs) < 2:
        return []
    story = [line for line in lines if line["channel"] == "story"][-WINDOW:]
    counts = {pc: 0 for pc in pcs}
    last_at = {pc: -1 for pc in pcs}
    for at, line in enumerate(story):
        if line["speaker"] in counts:
            counts[line["speaker"]] += 1
            last_at[line["speaker"]] = at
    below = QUIET_SHARE * sum(counts.values()) / len(pcs)
    quiet = [pc for pc in pcs if counts[pc] == 0 or counts[pc] < below]
    return sorted(quiet, key=lambda pc: (counts[pc], last_at[pc], pc))[:MAX_NAMED]


def spotlight_note(quiet: Sequence[str]) -> str:
    """The line the GM reads, or nothing when no one is quiet."""
    if not quiet:
        return ""
    names = quiet[0] if len(quiet) == 1 else f"{', '.join(quiet[:-1])} and {quiet[-1]}"
    return NOTE.replace("{names}", names)
