# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native APIs (audit gap 8) against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.NativeApis import (  # type: ignore[import-not-found]
    native_delta,
    native_model_ids,
    native_models_request,
    native_request,
    openai_payload,
)

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "native-api-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["request_cases"], ids=[case["name"] for case in CASES["request_cases"]])
def test_asks_each_api_in_its_own_shape(case: dict[str, Any]) -> None:
    assert native_request(case["api"], case["base_url"], case["api_key"], case["body"]) == case["request"]


@pytest.mark.parametrize("case", CASES["delta_cases"], ids=[case["name"] for case in CASES["delta_cases"]])
def test_reads_each_stream_as_openai_chunks(case: dict[str, Any]) -> None:
    assert native_delta(case["api"], case["payload"]) == case["delta"]
    expected = None if case["delta"] is None else {"choices": [{"delta": case["delta"]}]}
    found = openai_payload(case["api"], case["payload"])
    assert (None if found is None else json.loads(found)) == expected


@pytest.mark.parametrize("case", CASES["models_cases"], ids=[case["name"] for case in CASES["models_cases"]])
def test_lists_each_apis_models(case: dict[str, Any]) -> None:
    assert native_models_request(case["api"], case["base_url"], case["api_key"]) == case["request"]
    assert native_model_ids(case["api"], case["answer"]) == case["ids"]
