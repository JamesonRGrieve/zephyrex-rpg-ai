# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extra request fields per endpoint (SillyTavern's "additional parameters"): a JSON object merged into
every request body sent to that endpoint, after the app's own fields. It can set what the app doesn't
send (``reasoning_effort: "none"``, say) or override a sampler; it never replaces the fields that carry
the conversation (the contract's ``reserved``).

The twin of client/src/features/models/extraBody.ts, held to contract/extra-body-cases.json.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

EXTRA_BODY: dict[str, Any] = CONTRACT["extra_body"]


def extra_body_problem(value: Any) -> str | None:
    """Why ``value`` can't be kept as an endpoint's extra fields, or None."""
    if not isinstance(value, dict):
        return "Extra request fields are a JSON object"
    if len(value) > EXTRA_BODY["max_keys"]:
        return f"Extra request fields hold at most {EXTRA_BODY['max_keys']} fields"
    reserved = [key for key in value if key in EXTRA_BODY["reserved"]]
    if reserved:
        return f"Extra request fields can't set {', '.join(reserved)}"
    if len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()) > EXTRA_BODY["max_bytes"]:
        return f"Extra request fields are at most {EXTRA_BODY['max_bytes']} bytes"
    return None


def with_extra_body(body: Mapping[str, Any], extra: Mapping[str, Any] | None) -> dict[str, Any]:
    """The request body with the endpoint's extra fields merged in, never over the reserved ones."""
    merged = dict(body)
    for key, value in (extra or {}).items():
        if key not in EXTRA_BODY["reserved"]:
            merged[key] = value
    return merged
