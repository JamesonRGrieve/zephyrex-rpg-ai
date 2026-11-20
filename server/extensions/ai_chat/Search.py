# SPDX-License-Identifier: AGPL-3.0-or-later
"""Web search injected into context (A42).

The search source is set per install, as model endpoints are (the operator, 2026-11-20): a
SearXNG instance or the Brave search API. Results become one block the model reads, marked as
search results that may be wrong. The lite twin is client/src/lib/search.ts; both run
contract/search-cases.json.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlencode

import httpx
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

_CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "search-cases.json").read_text())
HEADING: str = _CASES["heading"]
MAX_RESULTS: int = _CASES["max_results"]
SNIPPET_CHARACTERS: int = _CASES["snippet_characters"]
QUERY_CHARACTERS: int = _CASES["query_characters"]
SEARCH_TIMEOUT_SECONDS = 8.0


def search_request(source: dict[str, str], query: str) -> dict[str, Any]:
    """The request a source is asked: its URL and headers."""
    base = source["base_url"].rstrip("/")
    if source["kind"] == "brave":
        return {
            "url": f"{base}/res/v1/web/search?{urlencode({'q': query, 'count': str(MAX_RESULTS)})}",
            "headers": {"Accept": "application/json", "X-Subscription-Token": source["api_key"]},
        }
    return {
        "url": f"{base}/search?{urlencode({'q': query, 'format': 'json'})}",
        "headers": {"Accept": "application/json"},
    }


def _text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", value)).strip()


def search_results(kind: str, answer: Any) -> list[dict[str, str]]:
    """The results in a source's answer: those with a title and a URL, at most the limit."""
    if not isinstance(answer, dict):
        return []
    web = answer.get("web")
    found = (web.get("results") if isinstance(web, dict) else None) if kind == "brave" else answer.get("results")
    if not isinstance(found, list):
        return []
    snippet_key = "description" if kind == "brave" else "content"
    results = []
    for item in found:
        item = item if isinstance(item, dict) else {}
        result = {
            "title": _text(item.get("title")),
            "url": _text(item.get("url")),
            "snippet": _text(item.get(snippet_key))[:SNIPPET_CHARACTERS],
        }
        if result["title"] and result["url"]:
            results.append(result)
    return results[:MAX_RESULTS]


def search_context(query: str, results: list[dict[str, str]]) -> str:
    """The block the model reads; empty when there are no results."""
    if not results:
        return ""
    lines = [
        f"{index}. {result['title']} ({result['url']}): {result['snippet']}" for index, result in enumerate(results, 1)
    ]
    return "\n".join([HEADING.replace("{query}", query), *lines])


async def web_search(client: httpx.AsyncClient, source: dict[str, str], query: str) -> list[dict[str, str]]:
    """Searches the source; an empty list when it can't be reached or answers nothing usable."""
    request = search_request(source, query)
    try:
        response = await client.get(request["url"], headers=request["headers"], timeout=SEARCH_TIMEOUT_SECONDS)
        return search_results(source["kind"], response.json()) if response.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []
