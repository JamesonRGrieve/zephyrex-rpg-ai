# SPDX-License-Identifier: AGPL-3.0-or-later
"""Each line of a saved story message labelled by the decision model (the operator, 2026-11-22): its kind,
its actor and its icon, in one decide call per message.

The twin of client/src/features/chat/lineLabels.ts, held to contract/line-labels-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

LINE_LABELS: dict[str, Any] = CONTRACT["line_labels"]
_MANNER_WORDS: dict[str, str] = CONTRACT["player_lines"]["manner_words"]
ACTION_KINDS: list[str] = list(CONTRACT["action_kinds"])


def _manner(line: str) -> str:
    """A say line's manner from its own form (``Name (to X, whispers): …``, ``(vox to X)``), else speak."""
    found = re.match(r"[^(:\"“]{1,60}\(([^)]*)\)\s*:", line)
    paren = found.group(1).lower() if found else ""
    if re.search(r"\bvoxcast\b", paren):
        return "voxcast"
    if re.search(r"\bvox\b", paren):
        return "vox"
    if _MANNER_WORDS["whisper"] in paren:
        return "whisper"
    if _MANNER_WORDS["shout"] in paren:
        return "shout"
    return "speak"


def message_lines(text: str) -> list[str]:
    """A message's lines: each non-blank line, trimmed, at most max_lines, its thinking (shown folded,
    never story) left out."""
    from zephyrex.extensions.ai_chat.Prompt import story_text  # type: ignore[import-not-found]

    return [line.strip() for line in story_text(text).split("\n") if line.strip()][: int(LINE_LABELS["max_lines"])]


def label_questions(
    lines: Sequence[str], previous: Sequence[str], people: Sequence[Mapping[str, Any]]
) -> tuple[str, dict[str, dict[str, Any]]]:
    """The state the decision model reads (the two lines before, then the lines) and its questions."""
    actors = [str(person["name"]) for person in people] + [str(LINE_LABELS["narrator"])]
    questions: dict[str, dict[str, Any]] = {}
    for index, line in enumerate(lines):

        def ask(template: str, line: str = line, index: int = index) -> str:
            return template.replace("{{line}}", line).replace("{{n}}", str(index + 1))

        questions[f"kind_{index}"] = {
            "type": "choice",
            "instructions": ask(LINE_LABELS["kind_question"]),
            "criteria": list(LINE_LABELS["kinds"]),
        }
        questions[f"actor_{index}"] = {
            "type": "choice",
            "instructions": ask(LINE_LABELS["actor_question"]),
            "criteria": actors,
        }
        questions[f"target_{index}"] = {
            "type": "choice",
            "instructions": ask(LINE_LABELS["target_question"]),
            "criteria": [str(person["name"]) for person in people] + [str(LINE_LABELS["no_one"])],
        }
        questions[f"icon_{index}"] = {
            "type": "choice",
            "instructions": ask(LINE_LABELS["icon_question"]),
            "criteria": [*ACTION_KINDS, str(LINE_LABELS["none"])],
        }
    before = [f"Before: {line}" for line in list(previous)[-2:]]
    state = "\n".join([*before, *(f"Line {index + 1}: {line}" for index, line in enumerate(lines))])
    return state, questions


def read_labels(
    lines: Sequence[str], answers: Mapping[str, Any] | None, people: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """The labels the answers give, one per line; a line the model left unread is the narrator's narration."""

    def pick(key: str) -> str | None:
        answer = (answers or {}).get(key)
        choice = answer.get("choice") if isinstance(answer, Mapping) else None
        return choice if isinstance(choice, str) else None

    labels = []
    for index, text in enumerate(lines):
        said = pick(f"kind_{index}")
        kind = said if said in LINE_LABELS["kinds"] else "narrate"
        name = pick(f"actor_{index}")
        person = next((one for one in people if one["name"] == name), None)
        icon = pick(f"icon_{index}")
        voiced = kind not in ("narrate", "drop")
        labels.append(
            {
                "index": index,
                "text": text,
                "kind": kind,
                "actor_id": str(person["id"]) if voiced and person is not None else None,
                "actor_name": str(person["name"]) if voiced and person is not None else None,
                "target_name": next(
                    (str(one["name"]) for one in people if voiced and one["name"] == pick(f"target_{index}")), None
                ),
                "manner": _manner(text) if kind == "say" else None,
                "icon": icon if icon in ACTION_KINDS and kind == "do" else None,
            }
        )
    return labels
