# SPDX-License-Identifier: AGPL-3.0-or-later
"""The operator's sign-in instance is made once, only when its issuer is configured."""

from types import SimpleNamespace
from typing import Any

import pytest
from zephyrex.extensions.ai_chat import SignIn  # type: ignore[import-not-found]


class _Instances:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def list(self, **filters: Any) -> list[dict[str, Any]]:
        return [row for row in self.rows if all(row.get(key) == value for key, value in filters.items())]

    def create(self, **fields: Any) -> dict[str, Any]:
        self.rows.append(fields)
        return fields


def _requester(instances: _Instances) -> Any:
    def as_requester(manager: type, requester_id: str) -> Any:
        if manager.__name__ == "ProviderManager":
            return SimpleNamespace(get=lambda name: SimpleNamespace(id=f"p-{name}"))
        return instances

    return as_requester


def test_without_an_issuer_nothing_is_made(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(SignIn, "env", lambda name: "")
    instances = _Instances()
    assert SignIn.ensure_sign_in_instance(_requester(instances)) is False
    assert instances.rows == []


def test_with_an_issuer_the_root_instance_is_made_once(monkeypatch: pytest.MonkeyPatch) -> None:
    values = {"OIDC_CONSUMER_ISSUER_URL": "https://auth.example/application/o/rpg/", "ROOT_ID": "root"}
    monkeypatch.setattr(SignIn, "env", lambda name: values.get(name, ""))
    instances = _Instances()
    assert SignIn.ensure_sign_in_instance(_requester(instances)) is True
    assert SignIn.ensure_sign_in_instance(_requester(instances)) is True
    assert instances.rows == [{"name": "authentik", "provider_id": "p-oidc", "scope": "root"}]
