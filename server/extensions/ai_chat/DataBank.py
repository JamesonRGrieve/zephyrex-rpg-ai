# SPDX-License-Identifier: AGPL-3.0-or-later
"""The data bank (A41): documents a chat, a character or everyone can draw on, retrieved by the
words the story is using. The twin of client/src/features/chat/dataBank.ts, held to
contract/databank-cases.json.

1. **Chunks:** a document is cut at blank lines into paragraphs, and paragraphs are joined (with a
   blank line) while the chunk stays within ``chunk_characters``; a paragraph longer than that is
   cut into pieces of that many characters.
2. **Words:** lower-cased runs of letters and digits, at least ``min_word_characters`` long, less
   the contract's stop words.
3. **Score:** how many distinct words of the last ``scan_turns`` story turns a chunk contains. The
   ``chunks`` best with a score above zero are kept, the earlier on a tie, and returned in their
   documents' order. Integers only, so both languages always agree.

Recall by meaning (embeddings, the framework's ``ai_memories``) can replace the score in the SaaS
edition; the chunking and the place in the prompt stay.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

BANK = CONTRACT["data_bank"]
STOP = frozenset(BANK["stop_words"])
_WORD = re.compile(r"[^\W_]+")
_BREAK = re.compile(r"\n\s*\n")


def chunks_of(text: str) -> list[str]:
    limit = BANK["chunk_characters"]
    pieces: list[str] = []
    for paragraph in (part.strip() for part in _BREAK.split(text)):
        if not paragraph:
            continue
        pieces += [paragraph[at : at + limit] for at in range(0, len(paragraph), limit)]
    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + 2 + len(piece) <= limit:
            chunks[-1] = f"{chunks[-1]}\n\n{piece}"
        else:
            chunks.append(piece)
    return chunks


def words_of(text: str) -> set[str]:
    return {
        word for word in _WORD.findall(text.lower()) if len(word) >= BANK["min_word_characters"] and word not in STOP
    }


def retrieve(documents: Sequence[str], story: Sequence[str]) -> list[str]:
    """The chunks of ``documents`` most about the last turns of ``story``, in document order."""
    wanted = words_of("\n".join(story[-BANK["scan_turns"] :])) if story else set()
    if not wanted:
        return []
    chunks = [chunk for document in documents for chunk in chunks_of(document)]
    scored = [(len(words_of(chunk) & wanted), order, chunk) for order, chunk in enumerate(chunks)]
    found = sorted((entry for entry in scored if entry[0] > 0), key=lambda entry: (-entry[0], entry[1]))
    best = found[: BANK["chunks"]]
    return [chunk for _score, _order, chunk in sorted(best, key=lambda entry: entry[1])]


def data_bank_text(documents: Sequence[str], story: Sequence[str]) -> str:
    """The prompt section: the retrieved chunks under the contract's prefix, or nothing."""
    found = retrieve(documents, story)
    return BANK["prefix"] + "\n\n".join(found) if found else ""


def wiki_document_texts(documents: Sequence[Mapping[str, Any]], gm: bool) -> list[str]:
    """The data bank's documents from the wiki (the composed suite, mapping item 4): the chat's wiki
    campaign's documents, their texts in name order, then id; empty texts drop out, and a GM-only
    document reaches only the GM's prompts (E)."""
    kept = [
        document
        for document in documents
        if str(document.get("text") or "").strip() and (gm or not document.get("gm_only"))
    ]
    return [str(document["text"]) for document in sorted(kept, key=lambda d: (str(d["name"]), str(d["id"])))]
