# SPDX-License-Identifier: AGPL-3.0-or-later
"""rpg-ai's embedder for the wiki's lore search (the operator's hybrid retrieval, 2026-11-22): texts in,
vectors out, against the "embed"-role model endpoint (nomic-embed-text-v1.5 on the 3-5gb tier). The
wiki adds its own query and document prefixes and runs this in a worker thread, so it is synchronous;
it raises when no endpoint embeds or the endpoint fails, for the wiki's loop to retry later.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
from zephyrex.extensions.ai_chat.Memory import embeddings_body, embeddings_url, vectors_of  # type: ignore[import-not-found]

EMBED_TIMEOUT_SECONDS = 60.0


def embed_endpoint(model_registry: Any, requester_id: str) -> Any:
    """The first model endpoint set to embed (the "embed" role) the requester can read, or None."""
    from zephyrex.extensions.ai_chat.BLL_AI_Chat import ModelEndpointManager  # type: ignore[import-not-found]

    rows = ModelEndpointManager(requester_id=requester_id, model_registry=model_registry).list()
    return next((row for row in rows if "embed" in (row.roles or [])), None)


def lore_embedder(model_registry: Any, requester_id: str) -> Callable[[list[str]], list[list[float]]]:
    """The wiki's embedder: each call finds the embedding endpoint anew (one set later still counts)."""

    def embed(texts: list[str]) -> list[list[float]]:
        from zephyrex.lib.SecretEncryption import decrypt_secret

        if not texts:
            return []
        endpoint = embed_endpoint(model_registry, requester_id)
        if endpoint is None:
            raise RuntimeError("No model endpoint is set to embed")
        key = decrypt_secret(endpoint.api_key) if endpoint.api_key else ""
        answer = httpx.post(
            embeddings_url(endpoint.base_url),
            headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})},
            json=embeddings_body(endpoint.model, texts),
            timeout=EMBED_TIMEOUT_SECONDS,
        )
        answer.raise_for_status()
        vectors: list[list[float]] | None = vectors_of(answer.json(), len(texts))
        if vectors is None:
            raise RuntimeError("The embedding endpoint sent no vector for each text")
        return vectors

    return embed
