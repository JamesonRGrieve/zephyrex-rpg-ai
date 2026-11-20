# SPDX-License-Identifier: AGPL-3.0-or-later
"""The model-server addresses and the picture in an image model's answer, as lib/generate.ts
finds them (its tests hold the same cases)."""

import pytest
from zephyrex.extensions.ai_chat.BLL_AI_Chat import completions_url, images_url, picture_of  # type: ignore[import-not-found]


@pytest.mark.parametrize(
    ("base", "api", "url"),
    [
        ("http://h:1/v1", "chat", "http://h:1/v1/chat/completions"),
        ("http://h:1/v1//", "chat", "http://h:1/v1/chat/completions"),
        ("http://h:1/v1/chat/completions", "chat", "http://h:1/v1/chat/completions"),
        ("http://h:1/v1", "text", "http://h:1/v1/completions"),
        ("http://h:1/v1/chat/completions", "text", "http://h:1/v1/completions"),
        ("http://h:1/v1/completions", "text", "http://h:1/v1/completions"),
        ("http://h:1/v1/completions", "chat", "http://h:1/v1/chat/completions"),
    ],
)
def test_completions_url(base: str, api: str, url: str) -> None:
    assert completions_url(base, api) == url


def test_images_url() -> None:
    assert images_url("http://h:1/v1/chat/completions") == "http://h:1/v1/images/generations"
    assert images_url("http://h:1/v1/") == "http://h:1/v1/images/generations"


def test_picture_of_keeps_only_a_picture_it_can_store() -> None:
    assert picture_of({"data": [{"b64_json": "AAAA"}]}) == "data:image/png;base64,AAAA"
    assert picture_of({"data": [{"url": "data:image/webp;base64,AAAA"}]}) == "data:image/webp;base64,AAAA"
    assert picture_of({"data": [{"url": "https://elsewhere.example/a.png"}]}) is None
    assert picture_of({"error": "no"}) is None
    assert picture_of({"data": []}) is None
