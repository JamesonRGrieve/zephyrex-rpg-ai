# SPDX-License-Identifier: AGPL-3.0-or-later
"""The reformat model (the operator, 2026-11-23): attribution among the people present only."""

from __future__ import annotations

import json

from zephyrex.extensions.ai_chat.Reformat import (  # type: ignore[import-not-found]
    faithful,
    reformat_items,
    reformat_request,
    reformat_schema,
)
from zephyrex.extensions.ai_chat.Structured import structured_runs  # type: ignore[import-not-found]

PROSE = 'The hooded woman leans in. "You came," she says. Mags slams a tankard down. "Drink or leave."'


def test_speakers_can_only_be_the_people_present() -> None:
    schema = reformat_schema(["Mags", "Wren", "Mags"])
    item = schema["properties"]["items"]["items"]["properties"]
    assert item["speaker"]["enum"] == ["Mags", "Wren", None]
    assert item["target"]["enum"] == ["Mags", "Wren", None]
    asked = reformat_request("small", PROSE, ["Mags", "Wren"])
    assert "Mags, Wren" in asked["messages"][0]["content"] and asked["messages"][1]["content"] == PROSE
    assert asked["response_format"]["json_schema"]["strict"] is True and "max_tokens" not in asked


def test_someone_not_present_is_narration_and_the_runs_follow() -> None:
    answer = json.dumps(
        {
            "items": [
                {"kind": "narrate", "speaker": None, "target": None, "manner": None, "text": "The woman leans in."},
                {"kind": "say", "speaker": "Ma Delvin", "target": None, "manner": "speak", "text": '"You came."'},
                {"kind": "do", "speaker": "Mags", "target": None, "manner": None, "text": "slams a tankard down."},
                {"kind": "say", "speaker": "Mags", "target": "Wren", "manner": "shout", "text": "Drink or leave."},
            ]
        }
    )
    items = reformat_items(answer, ["Mags", "Wren"])
    assert items is not None
    assert items[1]["fields"] == {"kind": "narrate", "speaker": None, "target": None, "manner": "speak"}
    runs = structured_runs(items, [{"id": "p-mags", "name": "Mags"}, {"id": "p-wren", "name": "Wren"}], "")
    assert [run["speaker_id"] for run in runs["runs"]] == [None, "p-mags"]
    assert runs["runs"][1]["lines"][1]["target_id"] == "p-wren"
    assert reformat_items("not json", ["Mags"]) is None
    assert reformat_items('{"items": []}', ["Mags"]) is None


def test_a_rewrite_is_refused_and_a_resort_is_kept() -> None:
    kept = [
        {"text": "The hooded woman leans in."},
        {"text": '"You came," she says.'},
        {"text": "Mags slams a tankard down."},
    ]
    assert faithful(PROSE, [*kept, {"text": "Drink or leave."}])
    assert not faithful(PROSE, [{"text": "A woman greets you and the barkeep is rude."}])
    assert not faithful(PROSE, kept[:1])
