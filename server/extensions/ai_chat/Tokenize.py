# SPDX-License-Identifier: AGPL-3.0-or-later
"""Counting tokens with the model server's own tokenizer (A47; the operator's choice, 2026-11-20).

llama.cpp, vLLM and KoboldCpp each answer a tokenize request; others don't, and the
characters-per-token estimate stands for them. The lite twin is client/src/lib/tokenize.ts;
both run contract/tokenize-cases.json.
"""

from __future__ import annotations

import re
from typing import Any

import httpx

TOKENIZE_TIMEOUT_SECONDS = 5.0


def tokenizer_root(base_url: str) -> str:
    """The server's own root, where its tokenize routes are: the base URL without /v1 or a completions path."""
    url = re.sub(r"/(chat/)?completions$", "", base_url.rstrip("/"))
    return re.sub(r"/v1$", "", url)


def tokenize_requests(base_url: str, model: str, text: str) -> list[dict[str, Any]]:
    """The requests to try, in order: llama.cpp, vLLM, then KoboldCpp."""
    root = tokenizer_root(base_url)
    return [
        {"url": f"{root}/tokenize", "body": {"content": text}},
        {"url": f"{root}/tokenize", "body": {"model": model, "prompt": text}},
        {"url": f"{root}/api/extra/tokencount", "body": {"prompt": text}},
    ]


def token_count_from(answer: Any) -> int | None:
    """The count in a tokenize answer, or None when it holds none."""
    if not isinstance(answer, dict):
        return None
    for key in ("count", "value"):
        value = answer.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            return value if value >= 0 else None
    tokens = answer.get("tokens")
    return len(tokens) if isinstance(tokens, list) else None


async def server_token_count(
    client: httpx.AsyncClient,
    base_url: str,
    model: str,
    text: str,
    headers: dict[str, str] | None = None,
) -> int | None:
    """The server's own count of ``text``, or None when it answers none of the requests."""
    for request in tokenize_requests(base_url, model, text):
        try:
            response = await client.post(
                request["url"], json=request["body"], headers=headers, timeout=TOKENIZE_TIMEOUT_SECONDS
            )
            if response.status_code != 200:
                continue
            count = token_count_from(response.json())
        except (httpx.HTTPError, ValueError):
            continue
        if count is not None:
            return count
    return None
