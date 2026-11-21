# SPDX-License-Identifier: AGPL-3.0-or-later
"""A session report for the wiki's campaign log (A24).

The model is asked for it from the session's story lines (never its out-of-character ones), and
the wiki entities the report names are linked to the log entry. Who saves it depends on who runs
the game: a human GM reviews and saves; the AI GM's are saved automatically (the operator,
2026-11-20). The lite twin is client/src/features/campaign/sessionReport.ts; both run
contract/report-cases.json.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "report-cases.json").read_text())
REPORT_MAX_LINES: int = _CASES["max_lines"]
REPORT_SYSTEM: str = _CASES["system"]


def report_prompt(lines: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    """The request for a report: the instructions, then the session's last story lines, oldest first."""
    story = [line for line in lines if line["channel"] == "story"][-REPORT_MAX_LINES:]
    return [
        {"role": "system", "content": REPORT_SYSTEM},
        {"role": "user", "content": "\n".join(f"{line['speaker']}: {line['text']}" for line in story)},
    ]


def report_mentions(text: str, entities: Sequence[Mapping[str, Any]]) -> list[str]:
    """The entities a report names, each once, in the order the report first names them."""
    first_at: dict[str, int] = {}
    for entity in entities:
        for name in [entity["name"], *(entity.get("aliases") or [])]:
            name = name.strip()
            if not name:
                continue
            match = re.search(rf"(?<![^\W_]){re.escape(name)}(?![^\W_])", text, re.IGNORECASE)
            if match is not None and match.start() < first_at.get(entity["id"], len(text) + 1):
                first_at[entity["id"]] = match.start()
    return [entity_id for entity_id, _ in sorted(first_at.items(), key=lambda item: item[1])]
