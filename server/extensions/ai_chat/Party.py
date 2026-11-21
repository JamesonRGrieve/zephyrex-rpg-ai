# SPDX-License-Identifier: AGPL-3.0-or-later
"""Party members know each other (the operator, 2026-11-21): the chat's PCs (the wiki's PC tag; every
cast member when no record carries tags) plus whoever the person plays. Each party voice reads the
others with their one-line, its relationships to them and the party's shared briefing; the narrator
reads all of it.

The twin of client/src/features/prompt/party.ts, held to contract/party-cases.json.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

PARTY: dict[str, Any] = CONTRACT["party"]


def one_line(summary: str | None) -> str:
    """A summary's first sentence: how the others know someone at a glance."""
    text = (summary or "").strip().split("\n")[0]
    end = re.search(r"[.!?](\s|$)", text)
    return (text if end is None else text[: end.start() + 1]).strip()


def party_of(
    entities: Sequence[Mapping[str, Any]], cast_ids: Sequence[str], seated_id: str | None
) -> list[dict[str, str]]:
    """The party: the chat's PCs (by tag, or every cast member when no record has tags) and the seat."""
    persons = {
        entity["id"]: entity for entity in entities if entity.get("kind") == "person" and not entity.get("deleted")
    }
    tagged = any(isinstance(entity.get("tags"), list) for entity in entities)
    ids = [*([seated_id] if seated_id is not None else []), *[id_ for id_ in cast_ids if id_ != seated_id]]
    party: list[dict[str, str]] = []
    for id_ in ids:
        person = persons.get(id_)
        if person is None:
            continue
        if tagged and id_ != seated_id and PARTY["tag"] not in (person.get("tags") or []):
            continue
        party.append({"id": id_, "name": str(person["name"]), "line": one_line(person.get("summary"))})
    return party


def party_briefing(entities: Sequence[Mapping[str, Any]]) -> list[str]:
    """The party's shared briefing: the campaign's journals named as one, never GM-only, in name order."""
    found = [
        entity
        for entity in entities
        if entity.get("kind") == "journal"
        and not entity.get("deleted")
        and not entity.get("gm_only")
        and any(name in str(entity["name"]).lower() for name in PARTY["briefing_names"])
        and str(entity.get("summary") or "").strip()
    ]
    return [str(entity["summary"]).strip() for entity in sorted(found, key=lambda entity: str(entity["name"]))]


def _member(one: Mapping[str, str]) -> str:
    return f"{one['name']} ({one['line']})" if one["line"] else one["name"]


def party_text(
    party: Sequence[Mapping[str, str]],
    speaker_id: str | None,
    entities: Sequence[Mapping[str, Any]],
    briefing: Sequence[str],
) -> str:
    """The party block a voice reads: for a party member the others (and its relationships to them), for
    the narrator (speaker_id None) everyone, then the shared briefing; nothing outside the party."""
    speaker = next((one for one in party if one["id"] == speaker_id), None) if speaker_id is not None else None
    if speaker_id is not None and speaker is None:
        return ""
    others = [one for one in party if one["id"] != speaker_id]
    if not others and not briefing:
        return ""
    lines: list[str] = []
    if others:
        members = ", ".join(_member(one) for one in others)
        lines.append((PARTY["narrator"] if speaker is None else PARTY["voice"]).replace("{{members}}", members))
    if speaker is not None:
        own = next((entity for entity in entities if entity.get("id") == speaker["id"]), {})
        for relation in own.get("relationships") or []:
            other = next((one for one in others if one["id"] == relation.get("to_id")), None)
            # The row's notes, else its kind ("sibling", "rival"); a tie with neither says nothing.
            note = str(relation.get("note") or "").strip() or str(relation.get("kind") or "").strip()
            if other is not None and note:
                lines.append(PARTY["relationship"].replace("{{name}}", other["name"]).replace("{{note}}", note))
    if briefing:
        lines.append("\n".join([PARTY["briefing_heading"], *briefing]))
    # The play-test: a party voice made up months of shared work the scenario never gave them.
    lines.append(PARTY["no_invention"])
    return "\n".join(lines)
