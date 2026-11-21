# SPDX-License-Identifier: AGPL-3.0-or-later
"""The data bank against the case file the client's twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.DataBank import (  # type: ignore[import-not-found]
    chunks_of,
    data_bank_text,
    retrieve,
    wiki_document_texts,
)

CASES: list[dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "databank-cases.json").read_text())["cases"]
WIKI_CASES: list[dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "databank-cases.json").read_text())[
    "wiki_cases"
]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_the_shared_cases(case: dict[str, Any]) -> None:
    assert [chunks_of(document) for document in case["documents"]] == case["chunks"]
    assert retrieve(case["documents"], case["story"]) == case["retrieved"]
    assert data_bank_text(case["documents"], case["story"]) == case["text"]


@pytest.mark.parametrize("case", WIKI_CASES, ids=[case["name"] for case in WIKI_CASES])
def test_the_data_bank_from_the_wiki(case: dict[str, Any]) -> None:
    assert wiki_document_texts(case["documents"]) == case["texts"]
