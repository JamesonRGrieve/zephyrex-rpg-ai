# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recall by meaning (A19), SaaS edition: a chat's older story lines, embedded by the person's model
set to embed (the ``embed`` role) at its OpenAI-compatible ``POST /embeddings``, kept as the
framework's ai_memories (one memory a chunk: ``conversation_id`` the chat, ``key`` the line, chunk
and digest, ``embedding_model`` the model), and recalled into the prompt's memories section by
Memory.py, the twin of client/src/lib/memory.ts.

Recall never stops a reply: without a model set to embed, or when it fails, the section is empty.
An edited line is embedded again (its digest changed); a line no longer on the branch is forgotten.

A character's memory across chats (AP8, MemoryAcross.py): when the replying character remembers
across chats, recall also searches the memories of the person's other chats it was cast in (the
requester's own chats only), within the same budget, under their own label.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import httpx
from zephyrex.extensions.ai_chat.Memory import (  # type: ignore[import-not-found]
    MEMORY,
    Remembered,
    embeddings_body,
    embeddings_url,
    memory_chunks,
    memory_query,
    vectors_of,
)
from zephyrex.extensions.ai_chat.MemoryAcross import (  # type: ignore[import-not-found]
    across_text,
    cast_in,
    recall_across,
    remembers_across_chats,
)
from zephyrex.lib.Logging import logger
from zephyrex.lib.SecretEncryption import decrypt_secret

EMBED_TIMEOUT_SECONDS = 30.0


def agent_of(chat_id: str) -> str:
    """The ai_memories agent a chat's memories are about."""
    return f"ai_chat:{chat_id}"


def _key(message_id: str, index: int, digest: str) -> str:
    return f"{message_id}:{index}:{digest}"


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embedder_of(endpoints: Sequence[Any]) -> Any | None:
    """The person's model set to embed: the default first, then by name."""
    embedding = sorted((row for row in endpoints if "embed" in (row.roles or [])), key=lambda row: row.name)
    return next((row for row in embedding if row.is_default), None) or next(iter(embedding), None)


async def _embed(endpoint: Any, inputs: Sequence[str]) -> list[list[float]] | None:
    key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
    try:
        async with httpx.AsyncClient(timeout=EMBED_TIMEOUT_SECONDS) as client:
            answer = await client.post(
                embeddings_url(endpoint.base_url),
                headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
                json=embeddings_body(endpoint.model, inputs),
            )
        if answer.status_code >= 400:
            return None
        found: list[list[float]] | None = vectors_of(answer.json(), len(inputs))
        return found
    except (httpx.HTTPError, ValueError):
        return None


async def memories_for(
    memories: Any,
    endpoints: Sequence[Any],
    chat_id: str,
    lines: Sequence[Mapping[str, str]],
    speaker: Mapping[str, Any] | None = None,
    chats: Callable[[], Sequence[Any]] = lambda: (),
) -> str:
    """The memories section for a chat's branch (``lines`` from Memory.story_lines): its older lines
    brought up to date (at most ``embed_batch`` new chunks a turn), then the ones closest to the
    last lines. ``memories`` is the requester's ai_memories MemoryManager; ``speaker`` (``id``,
    ``name``, ``extensions``) the replying character, and ``chats`` the requester's chats, read
    only when that character remembers across chats (AP8)."""
    try:
        return await _remembering(memories, endpoints, chat_id, lines, speaker, chats)
    except Exception as error:  # recall never stops a reply
        logger.warning(f"Recall by meaning skipped: {error}")
        return ""


def _elsewhere(
    memories: Any, chat_id: str, model: str, speaker: Mapping[str, Any] | None, chats: Callable[[], Sequence[Any]]
) -> list[Remembered]:
    """What the speaker remembers from the requester's other chats it was cast in, embedded by the
    same model; none unless it remembers across chats. In each chat's order, oldest chat first."""
    if speaker is None or not remembers_across_chats(speaker.get("extensions")):
        return []
    others = cast_in(sorted(chats(), key=lambda chat: str(chat.created_at)), speaker["id"], chat_id)
    rows = [
        row
        for other in others
        for row in sorted(
            memories.list(conversation_id=other, embedding_model=model),
            key=lambda row: (str(row.created_at), row.key or ""),
        )
        if row.embedding
    ]
    return [
        Remembered(text=row.content, vector=json.loads(row.embedding), order=order) for order, row in enumerate(rows)
    ]


async def _remembering(
    memories: Any,
    endpoints: Sequence[Any],
    chat_id: str,
    lines: Sequence[Mapping[str, str]],
    speaker: Mapping[str, Any] | None,
    chats: Callable[[], Sequence[Any]],
) -> str:
    endpoint = embedder_of(endpoints)
    query = memory_query(lines)
    if endpoint is None or not query:
        return ""
    digests = {line["id"]: _digest(line["text"]) for line in lines}
    chunks = memory_chunks(lines)
    order = {
        _key(chunk["message_id"], chunk["index"], digests[chunk["message_id"]]): at for at, chunk in enumerate(chunks)
    }
    texts = {_key(chunk["message_id"], chunk["index"], digests[chunk["message_id"]]): chunk["text"] for chunk in chunks}
    stored = memories.list(conversation_id=chat_id, embedding_model=endpoint.model)
    current = [row for row in stored if row.key in order and texts[row.key] == row.content and row.embedding]
    kept = {row.key for row in current}
    for row in stored:
        if row.key not in kept:
            memories.delete(id=row.id)
    missing = [key for key in order if key not in kept][: MEMORY["embed_batch"]]
    vectors = await _embed(endpoint, [query, *(texts[key] for key in missing)])
    if vectors is None:
        return ""
    query_vector, *new_vectors = vectors
    for key, vector in zip(missing, new_vectors, strict=True):
        memories.create(
            agent_id=agent_of(chat_id),
            conversation_id=chat_id,
            key=key,
            content=texts[key],
            source="ai_chat",
            embedding=json.dumps(vector),
            embedding_model=endpoint.model,
        )
    remembered = [
        Remembered(text=row.content, vector=json.loads(row.embedding), order=order[row.key]) for row in current
    ]
    remembered += [
        Remembered(text=texts[key], vector=vector, order=order[key])
        for key, vector in zip(missing, new_vectors, strict=True)
    ]
    name = str(speaker["name"]) if speaker is not None else ""
    elsewhere = _elsewhere(memories, chat_id, endpoint.model, speaker, chats)
    text: str = across_text(recall_across(query_vector, remembered, elsewhere, name), name)
    return text


def forget_chat(memories: Any, chat_id: str) -> None:
    """Forgets a chat's memories (when the chat is deleted)."""
    for row in memories.list(conversation_id=chat_id):
        memories.delete(id=row.id)
