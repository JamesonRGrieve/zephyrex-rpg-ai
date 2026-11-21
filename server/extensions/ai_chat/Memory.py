# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recall by meaning (A19): a chat's older story lines, embedded by a model set to embed, recalled
by how close they are to what the story is about now.

The twin of client/src/features/memory/memory.ts, held to contract/memory-cases.json.

0. **Lines:** the branch's story turns, each as "Speaker: text" (no OOC, nothing X-carded).
1. **Chunks:** every story line but the last ``recent_turns`` (those are in the context anyway) is
   cut at blank lines into paragraphs, joined (with a blank line) while a chunk stays within
   ``chunk_characters``; a paragraph longer than that is cut into pieces of that many characters.
2. **Query:** the last ``scan_turns`` story lines, one per line.
3. **Recall:** each chunk's cosine similarity to the query; those at ``min_similarity`` or above,
   the closest first (the earlier on a tie), up to ``recall`` of them and while they fit
   ``section_tokens``, returned in the story's order under the contract's prefix.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

MEMORY: dict[str, Any] = CONTRACT["memory"]
_CHARACTERS_PER_TOKEN: int = CONTRACT["prompt"]["characters_per_token"]
_BREAK = re.compile(r"\n\s*\n")


@dataclass(frozen=True)
class Remembered:
    text: str
    vector: Sequence[float]
    order: int


_STORY = frozenset(CONTRACT["prompt"]["story_channels"])
_NARRATOR: str = CONTRACT["prompt"]["narrator_name"]


def story_lines(
    turns: Sequence[Mapping[str, Any]], user_name: str, names_by_id: Mapping[str, str]
) -> list[dict[str, str]]:
    """A branch's story as lines to remember, each with its speaker first: the person by their
    persona's name, a character by theirs, anyone else as the narrator. Out-of-character talk and
    what the table X-carded (A25) are never remembered."""
    lines: list[dict[str, str]] = []
    for turn in turns:
        if turn["channel"] not in _STORY or turn.get("x_carded") is True:
            continue
        if turn["role"] == "user":
            name = user_name
        elif turn["role"] == "character":
            name = names_by_id.get(turn.get("speaker_character_id") or "", _NARRATOR)
        else:
            name = _NARRATOR
        lines.append({"id": turn["id"], "text": f"{name}: {turn['content']}"})
    return lines


def _cut(text: str) -> list[str]:
    limit: int = MEMORY["chunk_characters"]
    pieces: list[str] = []
    for paragraph in (part.strip() for part in _BREAK.split(text)):
        if paragraph:
            pieces += [paragraph[at : at + limit] for at in range(0, len(paragraph), limit)]
    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + 2 + len(piece) <= limit:
            chunks[-1] = f"{chunks[-1]}\n\n{piece}"
        else:
            chunks.append(piece)
    return chunks


def memory_chunks(lines: Sequence[Mapping[str, str]]) -> list[dict[str, Any]]:
    """The chunks a chat remembers: every story line (``id``, ``text``) but the most recent ones."""
    older = lines[: max(0, len(lines) - MEMORY["recent_turns"])]
    return [
        {"message_id": line["id"], "index": index, "text": text}
        for line in older
        for index, text in enumerate(_cut(line["text"]))
    ]


def memory_query(lines: Sequence[Mapping[str, str]]) -> str:
    """What recall is asked about: the last few story lines."""
    return "\n".join(line["text"] for line in lines[-MEMORY["scan_turns"] :]).strip()


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = left = right = 0.0
    for x, y in zip(a, b, strict=True):
        dot += x * y
        left += x**2
        right += y**2
    norm = math.sqrt(left) * math.sqrt(right)
    return dot / norm if norm else 0.0


def _tokens(text: str) -> int:
    return math.ceil(len(text) / _CHARACTERS_PER_TOKEN)


def recall(query: Sequence[float], remembered: Sequence[Remembered]) -> list[str]:
    """The remembered chunks closest to ``query``, within the section's budget, in story order."""
    scored = [(cosine(query, memory.vector), memory) for memory in remembered]
    close = sorted(
        ((similarity, memory) for similarity, memory in scored if similarity >= MEMORY["min_similarity"]),
        key=lambda pair: (-pair[0], pair[1].order),
    )
    kept: list[Remembered] = []
    spent = _tokens(MEMORY["prefix"])
    for _similarity, memory in close:
        if len(kept) == MEMORY["recall"]:
            break
        cost = _tokens(memory.text) + (0 if not kept else 1)
        if spent + cost > MEMORY["section_tokens"]:
            continue
        kept.append(memory)
        spent += cost
    return [memory.text for memory in sorted(kept, key=lambda memory: memory.order)]


def memory_text(recalled: Sequence[str]) -> str:
    """The prompt section: the recalled chunks under the contract's prefix, or nothing."""
    return str(MEMORY["prefix"]) + "\n\n".join(recalled) if recalled else ""


def embeddings_url(base_url: str) -> str:
    """Where a model embeds (OpenAI-compatible ``POST /embeddings``), beside its chat completions."""
    return re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/")) + str(MEMORY["path"])


def embeddings_body(model: str, inputs: Sequence[str]) -> dict[str, Any]:
    return {"model": model, "input": list(inputs)}


def vectors_of(answer: object, count: int) -> list[list[float]] | None:
    """The vectors of an ``/embeddings`` answer, in the order asked; None unless one per input."""
    data = answer.get("data") if isinstance(answer, dict) else None
    if not isinstance(data, list) or len(data) != count:
        return None
    vectors: list[list[float] | None] = [None] * count
    for position, item in enumerate(data):
        if not isinstance(item, dict):
            return None
        index = position if item.get("index") is None else item["index"]
        vector = item.get("embedding")
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < count:
            return None
        if (
            not isinstance(vector, list)
            or not vector
            or not all(
                isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)
                for value in vector
            )
        ):
            return None
        vectors[index] = [float(value) for value in vector]
    found = [vector for vector in vectors if vector is not None]
    return found if len(found) == count else None
