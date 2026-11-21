# SPDX-License-Identifier: AGPL-3.0-or-later
"""A scenario's cast, each NPC with an optional voice (voice acting), checked as the lite twin checks it."""

from __future__ import annotations

from typing import Any

import pytest
from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import _cast  # type: ignore[import-not-found]

PERSON = {"name": "Mira", "agenda": "Keep the gate", "secret": "She opened it", "disposition": "wary"}


def test_a_person_without_a_voice_stays_as_they_were() -> None:
    assert _cast([PERSON]) == [PERSON]


def test_a_voice_is_kept_with_its_npc() -> None:
    voice = {"name": "Samantha", "rate": 1.2, "pitch": 0.8, "server": "af_bella"}
    assert _cast([{**PERSON, "voice": voice}]) == [{**PERSON, "voice": voice}]
    assert _cast([{**PERSON, "voice": {}}]) == [{**PERSON, "voice": {}}]


@pytest.mark.parametrize(
    "voice",
    [
        {"accent": "posh"},
        {"rate": "fast"},
        {"rate": True},
        {"pitch": 99},
        {"server": "x" * 65},
        "Samantha",
    ],
)
def test_a_voice_out_of_shape_is_refused(voice: Any) -> None:
    with pytest.raises(ValueError):
        _cast([{**PERSON, "voice": voice}])


def test_the_four_parts_of_a_person_are_still_required() -> None:
    with pytest.raises(ValueError):
        _cast([{"name": "Mira", "voice": {}}])
