# SPDX-License-Identifier: AGPL-3.0-or-later
"""Narrator sliders choose the model by reputation and tune it (the operator, 2026-11-21): a model narrates
only when it isn't marked not a narrator, is at least min_params_b (or of unknown size) and adherent
enough; the nearest to the chat's set sliders wins. Tuning maps verbosity to a max_tokens scale and a
length line, spice and darkness to tone lines capped by the table's content rating, humour to a little
temperature.

The twin of client/src/features/models/narratorStyle.ts, held to contract/narrator-style-cases.json.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT, REPOSITORY_ROOT  # type: ignore[import-not-found]

NARRATOR_STYLE: dict[str, Any] = CONTRACT["narrator_style"]
SEEDS: dict[str, dict[str, Any]] = json.loads((REPOSITORY_ROOT / "contract" / "model-traits.json").read_text())[
    "models"
]


def model_key(model: str) -> str:
    """A model name as the seeds key it: no tier prefix (72gb/), no tag (:latest), lower case."""
    return re.sub(r":.*$", "", re.sub(r"^.*/", "", model.strip().lower()))


def traits_of(endpoint: Mapping[str, Any]) -> dict[str, Any]:
    """An endpoint's traits: the seeds for its model, its own overriding."""
    return {**SEEDS.get(model_key(str(endpoint["model"])), {}), **(endpoint.get("traits") or {})}


def may_narrate(traits: Mapping[str, Any]) -> bool:
    """Whether a model may narrate: not marked otherwise, big enough (or unknown), adherent enough."""
    if traits.get("narrator") is False:
        return False
    params = traits.get("params_b")
    if isinstance(params, (int, float)) and params < NARRATOR_STYLE["min_params_b"]:
        return False
    adherence = traits.get("adherence")
    floor = float(NARRATOR_STYLE["adherence_floor"])
    return (float(adherence) if isinstance(adherence, (int, float)) else floor) >= floor


def _known(traits: Mapping[str, Any], key: str) -> float:
    found = traits.get(key)
    return float(found) if isinstance(found, (int, float)) else float(NARRATOR_STYLE["unknown"])


def _value(traits: Mapping[str, Any], slider: str) -> float:
    if slider == "spice":
        refuse = traits.get("refuse")
        return _known(traits, "spice") * (1 - (float(refuse) if isinstance(refuse, (int, float)) else 0.0))
    return _known(traits, slider)


def _speed(traits: Mapping[str, Any]) -> float:
    return _known(traits, "speed") * (1.0 if traits.get("warm") is True else float(NARRATOR_STYLE["cold_speed_factor"]))


def narrator_endpoint(
    endpoints: Sequence[Mapping[str, Any]], style: Mapping[str, Any] | None, explicit_id: str | None
) -> str | None:
    """The endpoint to narrate with, or None to keep the current choice (see narratorStyle.ts)."""
    if explicit_id is not None and any(endpoint["id"] == explicit_id for endpoint in endpoints):
        return explicit_id
    roled = [endpoint for endpoint in endpoints if {"story", "gm"} & set(endpoint.get("roles") or [])]
    candidates = roled or [endpoint for endpoint in endpoints if endpoint.get("is_default")]
    pool = [endpoint for endpoint in candidates if may_narrate(traits_of(endpoint))]
    if not pool:
        return None
    chosen = style or {}
    set_sliders = [slider for slider in NARRATOR_STYLE["sliders"] if isinstance(chosen.get(slider), (int, float))]

    def rank(endpoint: Mapping[str, Any]) -> tuple[float, int, float, float]:
        traits = traits_of(endpoint)
        distance = sum((_value(traits, slider) - float(chosen[slider])) ** 2 for slider in set_sliders)
        adherence = 0.0 if set_sliders else -_known(traits, "adherence")
        return (round(distance, 9), 0 if endpoint.get("is_default") else 1, adherence, -_speed(traits))

    return str(min(pool, key=rank)["id"])


def style_tuning(style: Mapping[str, Any] | None, rating: str | None) -> dict[str, Any]:
    """How the sliders tune a turn, within the table's content rating."""
    chosen = style or {}
    verbosity = chosen.get("verbosity")
    band = (
        next((one for one in NARRATOR_STYLE["verbosity_bands"] if verbosity < one["below"]), None)
        if isinstance(verbosity, (int, float))
        else None
    )
    ratings = list(NARRATOR_STYLE["ratings"])
    allowed = ratings.index(rating) if rating in ratings else 0
    tones: list[str] = []
    for tone in NARRATOR_STYLE["tone"]:
        level = chosen.get(tone["slider"])
        if not isinstance(level, (int, float)):
            continue
        if level >= tone["high_at"] and allowed >= ratings.index(tone["high_rating"]):
            tones.append(tone["high"])
        elif level <= tone["low_at"]:
            tones.append(tone["low"])
    humour = chosen.get("humour")
    delta = 0.0
    if isinstance(humour, (int, float)):
        delta = round(float(humour) * float(NARRATOR_STYLE["temperature_delta"]), 3)
    return {
        "max_tokens_scale": band["scale"] if band else 1,
        "length": band["line"] if band else "",
        "tones": tones,
        "temperature_delta": delta,
    }


def _unit(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1


def traits_problem(value: Mapping[str, Any]) -> str | None:
    """Why an endpoint's own traits can't be kept, or None."""
    for key, one in value.items():
        if key in NARRATOR_STYLE["traits"]:
            if not _unit(one):
                return f"{key} is a number from 0 to 1"
        elif key == "params_b":
            if one is not None and not (isinstance(one, (int, float)) and not isinstance(one, bool) and one > 0):
                return "params_b is a size in billions"
        elif key in ("narrator", "warm"):
            if not isinstance(one, bool):
                return f"{key} is true or false"
        else:
            return f"{key} is not a trait"
    return None


def style_problem(value: Mapping[str, Any]) -> str | None:
    """Why a chat's narrator style can't be kept, or None: each slider 0-1, or None for any."""
    for key, one in value.items():
        if key not in NARRATOR_STYLE["sliders"]:
            return f"{key} is not a slider"
        if one is not None and not _unit(one):
            return f"{key} is a number from 0 to 1, or null for any"
    return None
