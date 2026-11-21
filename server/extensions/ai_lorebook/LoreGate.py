# SPDX-License-Identifier: AGPL-3.0-or-later
"""The lore relevance gate (A15).

Only when the keyword-matched entries don't fit the lore budget is a decision model asked which to
keep, from those entries only; its pick is applied in its order, each entry kept while it still
fits (the operator, 2026-11-20: "When too many match"). The lite twin is
client/src/features/lore/loreGate.ts; both run contract/lore-gate-cases.json.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def lore_gate_needed(tokens: Sequence[int], budget: int) -> bool:
    """Whether the matched entries overflow the budget, so the model must choose."""
    return sum(tokens) > budget


def apply_lore_pick(entries: Sequence[Mapping[str, Any]], picked: Sequence[str], budget: int) -> list[str]:
    """The ids kept from the model's pick: offered ones only, each once, in its order, while they fit."""
    offered = {entry["id"]: entry["tokens"] for entry in entries}
    kept: list[str] = []
    used = 0
    for entry_id in picked:
        tokens = offered.get(entry_id)
        if tokens is None or entry_id in kept or used + tokens > budget:
            continue
        kept.append(entry_id)
        used += tokens
    return kept
