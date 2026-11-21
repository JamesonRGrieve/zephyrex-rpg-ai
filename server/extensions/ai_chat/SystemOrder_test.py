# SPDX-License-Identifier: AGPL-3.0-or-later
"""The person's last line goes last, against the case file the lite twin runs too."""

from __future__ import annotations

import json
from typing import Any

import pytest
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.SystemOrder import systems_before_last_user  # type: ignore[import-not-found]

CASES: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "system-order-cases.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_order(case: dict[str, Any]) -> None:
    assert systems_before_last_user(case["messages"]) == case["ordered"]
