# SPDX-License-Identifier: AGPL-3.0-or-later
"""contract/backends.json holds: every wiki and VTT ability rpg-ai calls is listed there, and the in-house
backends offer each one marked required (the operator, 2026-11-24: the Foundry option, a second backend
implementing the same list)."""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from zephyrex.extensions.ai_character.Contract import REPOSITORY_ROOT  # type: ignore[import-not-found]

from rpg_ai_app import create

BACKENDS: dict[str, Any] = json.loads((REPOSITORY_ROOT / "contract" / "backends.json").read_text())
LISTED = {(ext, name) for ext, abilities in BACKENDS["abilities"].items() for name in abilities}
CALL = re.compile(r'loaded_ability\(\s*[^,]+,\s*"([a-z_]+)",\s*"([a-z_]+)"\s*\)')


def _called() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for path in (REPOSITORY_ROOT / "server" / "extensions").rglob("*.py"):
        if path.name.endswith("_test.py"):
            continue
        found |= {(ext, name) for ext, name in CALL.findall(path.read_text()) if ext.startswith("rpg_")}
    return found


def test_every_ability_rpg_ai_calls_is_in_the_contract() -> None:
    missing = sorted(_called() - LISTED)
    assert not missing, f"called but not in contract/backends.json: {missing}"


def test_the_contract_lists_only_what_rpg_ai_calls() -> None:
    # An ability another caller reaches for rpg-ai (`called_by`: the routing between backends) isn't rpg-ai's call.
    others = {
        (ext, name)
        for ext, abilities in BACKENDS["abilities"].items()
        for name, spec in abilities.items()
        if spec.get("called_by")
    }
    unused = sorted(LISTED - others - _called())
    assert not unused, f"in contract/backends.json but never called: {unused}"


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def test_the_in_house_backends_offer_every_required_ability(server: TestClient) -> None:
    from zephyrex.extensions.AbstractExtensionProvider import loaded_ability

    registry = server.app.state.model_registry  # type: ignore[attr-defined]
    required = sorted(
        (ext, name)
        for ext, abilities in BACKENDS["abilities"].items()
        for name, spec in abilities.items()
        if spec["required"]
    )
    absent = [one for one in required if loaded_ability(registry, *one) is None]
    assert not absent, f"required by contract/backends.json but not offered: {absent}"
