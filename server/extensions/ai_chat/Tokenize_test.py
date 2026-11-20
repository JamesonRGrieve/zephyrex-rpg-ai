# SPDX-License-Identifier: AGPL-3.0-or-later
"""The token counter against the case file the lite twin runs too, and against a fake server."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Tokenize import (  # type: ignore[import-not-found]
    server_token_count,
    token_count_from,
    tokenize_requests,
    tokenizer_root,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "tokenize-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["roots"], ids=[case["name"] for case in CASES["roots"]])
def test_finds_the_servers_root(case: dict[str, Any]) -> None:
    assert tokenizer_root(case["base_url"]) == case["root"]


@pytest.mark.parametrize("case", CASES["requests"], ids=[case["name"] for case in CASES["requests"]])
def test_tries_each_server_kind_in_order(case: dict[str, Any]) -> None:
    assert tokenize_requests(case["base_url"], case["model"], case["text"]) == case["tries"]


@pytest.mark.parametrize("case", CASES["answers"], ids=[case["name"] for case in CASES["answers"]])
def test_reads_the_count(case: dict[str, Any]) -> None:
    assert token_count_from(case["answer"]) == case["count"]


def test_falls_through_to_the_server_that_answers() -> None:
    seen: list[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(f"{request.url.path} {sorted(body)}")
        if request.url.path == "/api/extra/tokencount":
            return httpx.Response(200, json={"value": 4, "ids": [1, 2, 3, 4]})
        return httpx.Response(404, json={"detail": "Not Found"})

    async def ask() -> int | None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(answer)) as client:
            return await server_token_count(client, "http://kobold:5001/v1", "m", "Hi there")

    assert asyncio.run(ask()) == 4
    assert seen == ["/tokenize ['content']", "/tokenize ['model', 'prompt']", "/api/extra/tokencount ['prompt']"]


def test_none_when_no_server_counts() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async def ask() -> int | None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(refuse)) as client:
            return await server_token_count(client, "http://gone/v1", "m", "Hi")

    assert asyncio.run(ask()) is None
