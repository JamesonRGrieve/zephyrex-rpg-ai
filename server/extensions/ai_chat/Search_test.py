# SPDX-License-Identifier: AGPL-3.0-or-later
"""Web search against the case file the lite twin runs too, and against a fake source."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.Search import (  # type: ignore[import-not-found]
    search_context,
    search_request,
    search_results,
    web_search,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "search-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["requests"], ids=[case["name"] for case in CASES["requests"]])
def test_asks_the_source(case: dict[str, Any]) -> None:
    assert search_request(case["source"], case["query"]) == {"url": case["url"], "headers": case["headers"]}


@pytest.mark.parametrize("case", CASES["answers"], ids=[case["name"] for case in CASES["answers"]])
def test_reads_the_results(case: dict[str, Any]) -> None:
    assert search_results(case["kind"], case["answer"]) == case["results"]


@pytest.mark.parametrize("case", CASES["contexts"], ids=[case["name"] for case in CASES["contexts"]])
def test_writes_the_block(case: dict[str, Any]) -> None:
    assert search_context(case["query"], case["results"]) == case["text"]


def test_empty_when_the_source_refuses() -> None:
    async def ask() -> list[dict[str, str]]:
        transport = httpx.MockTransport(lambda request: httpx.Response(429, json={"error": "slow down"}))
        async with httpx.AsyncClient(transport=transport) as client:
            return await web_search(client, {"kind": "searxng", "base_url": "http://searx", "api_key": ""}, "q")

    assert asyncio.run(ask()) == []
