# SPDX-License-Identifier: AGPL-3.0-or-later
"""A playthrough gets its scenario's frame (Zephyrex RPG's prod run, 2026-11-22: every playthrough ran
without one): copied when the wiki starts it, backfilled for those started before, never a 404."""

import time
from collections.abc import Iterator
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from zephyrex.testing.factories import create_user

from rpg_ai_app import create


@pytest.fixture(scope="module")
def server() -> Iterator[TestClient]:
    yield TestClient(create())


def _headers(user: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {user.jwt}"}


def _create(server: TestClient, user: Any, resource: str, **fields: Any) -> dict[str, Any]:
    response = server.post(f"/v1/{resource}", json={resource: fields}, headers=_headers(user))
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json()[resource])


def _frames(server: TestClient, user: Any) -> list[dict[str, Any]]:
    answer = server.get("/v1/campaign_frame", headers=_headers(user))
    assert answer.status_code == 200, answer.text
    return cast("list[dict[str, Any]]", answer.json()["campaign_frames"])


def _started(server: TestClient, user: Any, scenario_id: str) -> str:
    """The playthrough a start makes, followed to its end."""
    accepted = server.post(
        f"/v1/campaign/{scenario_id}/instantiate", json={"instantiate": {"name": "Run"}}, headers=_headers(user)
    )
    assert accepted.status_code == 202, accepted.text
    start = accepted.json()["start"]
    deadline = time.monotonic() + 60
    while start["state"] == "running":
        assert time.monotonic() < deadline, start
        time.sleep(0.5)
        start = server.get(f"/v1/campaign_start/{start['id']}", headers=_headers(user)).json()["campaign_start"]
    assert start["state"] == "done", start
    return str(start["campaign_id"])


class TestFrames:
    def test_a_started_playthrough_has_its_scenarios_frame(self, server: TestClient) -> None:
        user = create_user(server)  # type: ignore[no-untyped-call]
        scenario = _create(server, user, "campaign", name="The Tavern", is_scenario=True)
        frame = _create(
            server,
            user,
            "campaign_frame",
            name="The Tavern",
            premise="A brawl.",
            truths=["The hearth is sacred."],
            wiki_campaign_id=scenario["id"],
        )
        _create(server, user, "scenario", name="Opening", campaign_id=frame["id"], premise="Rain.")
        played = _started(server, user, scenario["id"])
        copies = [one for one in _frames(server, user) if one["wiki_campaign_id"] == played]
        assert [(one["premise"], one["truths"]) for one in copies] == [("A brawl.", ["The hearth is sacred."])]
        listed = server.get(f"/v1/scenario?campaign_id={copies[0]['id']}", headers=_headers(user))
        scenarios = listed.json()["scenarios"]
        assert [(one["name"], one["premise"]) for one in scenarios] == [("Opening", "Rain.")]

    def test_a_playthrough_started_before_is_backfilled_once(self, server: TestClient) -> None:
        user = create_user(server)  # type: ignore[no-untyped-call]
        scenario = _create(server, user, "campaign", name="Old Scenario", is_scenario=True)
        played = _create(server, user, "campaign", name="Old Run", scenario_id=scenario["id"])
        _create(server, user, "campaign_frame", name="Old Scenario", truths=["Rain."], wiki_campaign_id=scenario["id"])
        pairs = {"backfill": {"pairs": [{"campaign_id": played["id"], "scenario_id": scenario["id"]}]}}
        first = server.post("/v1/campaign_frame/backfill", json=pairs, headers=_headers(user))
        assert first.status_code == 200, first.text
        assert first.json()["backfill"]["copied"] == [played["id"]]
        again = server.post("/v1/campaign_frame/backfill", json=pairs, headers=_headers(user))
        assert again.json()["backfill"]["copied"] == []
        kept = [one["truths"] for one in _frames(server, user) if one["wiki_campaign_id"] == played["id"]]
        assert kept == [["Rain."]]
