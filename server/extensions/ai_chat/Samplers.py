# SPDX-License-Identifier: AGPL-3.0-or-later
"""SillyTavern's further samplers (audit gap 2): min-P, typical-P, top-A, TFS, presence and
frequency penalty, repetition-penalty range and slope, DRY, XTC, Mirostat, dynamic temperature,
smoothing, epsilon and eta cutoffs, top-nsigma, seed, banned strings and sampler order.

The twin of client/src/features/prompt/samplers.ts, held to contract/sampler-cases.json.

A preset keeps only the ones set (``samplers``). Each goes upstream only when it's set away from its
neutral value, only to an API family that takes it, and only when the sampler it requires (DRY's
base needs its multiplier, say) is set too; it's sent under every name in its ``wire``, so each
backend finds the one it reads. An OpenAI-compatible chat API is never sent one it would refuse.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

SAMPLERS: dict[str, Any] = CONTRACT["samplers"]
_BY_NAME: dict[str, dict[str, Any]] = {param["name"]: param for param in SAMPLERS["params"]}


def _same(value: Any, neutral: Any) -> bool:
    if isinstance(value, list) and isinstance(neutral, list):
        return value == neutral
    if isinstance(value, bool) or isinstance(neutral, list) or isinstance(value, list):
        return False
    return bool(value == neutral)


def is_set(param: Mapping[str, Any], values: Mapping[str, Any]) -> bool:
    """Whether a sampler is set away from its off value."""
    return param["name"] in values and not _same(values[param["name"]], param["neutral"])


def sampler_params(values: Mapping[str, Any], api: str) -> dict[str, Any]:
    """The request fields for the samplers a preset sets, for an endpoint of ``api``."""
    out: dict[str, Any] = {}
    for param in SAMPLERS["params"]:
        if api not in param["apis"] or not is_set(param, values):
            continue
        needed = _BY_NAME.get(param["requires"]) if "requires" in param else None
        if needed is not None and not is_set(needed, values):
            continue
        value = values[param["name"]]
        for name in param["wire"]:
            out[name] = list(value) if isinstance(value, list) else value
    return out


def sampler_problem(values: Mapping[str, Any]) -> str | None:
    """Why a preset's samplers can't be kept, or None: unknown names, wrong kinds, out of range."""
    for name, value in values.items():
        param = _BY_NAME.get(name)
        if param is None:
            return f"{name} isn't a sampler"
        low, high = param["range"]
        if param["kind"] == "strings":
            if (
                not isinstance(value, list)
                or not low <= len(value) <= high
                or not all(isinstance(item, str) and len(item) <= SAMPLERS["string_characters"] for item in value)
            ):
                return f"{name} takes up to {high} lines of at most {SAMPLERS['string_characters']} characters"
            continue
        number = not isinstance(value, bool) and isinstance(value, int | float) and math.isfinite(value)
        if not number or not low <= value <= high:
            return f"{name} is from {_text(low)} to {_text(high)}"
        if param["kind"] == "integer" and not float(value).is_integer():
            return f"{name} is a whole number"
    return None


def _text(number: float) -> str:
    """A bound as the lite twin prints it (JavaScript's String of a number)."""
    return str(int(number)) if float(number).is_integer() else repr(float(number))
