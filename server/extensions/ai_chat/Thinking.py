# SPDX-License-Identifier: AGPL-3.0-or-later
"""A thinking model's story turn (the operator, 2026-11-22: "Why don't we want thinking? Doesn't it improve
narration quality? Just put thinking in a collapsible under narrator."): what a model streams split into
its thinking (the contract's reasoning pairs, tags kept) and its answer, as it comes, so the thinking goes
to the client as it is and only the answer meets the reply's guards. Contract thinking.
"""

from __future__ import annotations

from typing import Any

from zephyrex.extensions.ai_character.Contract import CONTRACT  # type: ignore[import-not-found]

THINKING: dict[str, Any] = CONTRACT["thinking"]
PAIRS: list[tuple[str, str]] = [(str(opening), str(closing)) for opening, closing in CONTRACT["reasoning"]["pairs"]]


def thinking_mode(traits: dict[str, Any]) -> str | None:
    """How a story turn treats a model's thinking: None for a model that doesn't think (its traits name no
    reasoning_effort), "off" for one whose traits say it chokes on it (thinking: false), else "on"."""
    if not traits.get("reasoning_effort"):
        return None
    return "off" if traits.get("thinking") is False else "on"


def thinking_fields(mode: str | None, effort: Any) -> dict[str, Any]:
    """The request fields for a story turn's thinking: on, briefly; off, in each server's own words."""
    if mode == "on":
        return {**THINKING["fields"], "reasoning_effort": THINKING["story_effort"]}
    if mode == "off":
        return {**CONTRACT["thinking_off"]["fields"], "reasoning_effort": effort or "none"}
    return {}


class ThinkSplitter:
    """Splits streamed text into ("think", text) and ("answer", text) pieces, a tag split across pieces
    held until it is whole. A think piece carries its tags, so the client keeps the block as written."""

    def __init__(self) -> None:
        self.closing: str | None = None
        self.held = ""
        self.thought = 0

    @property
    def inside(self) -> bool:
        return self.closing is not None

    def _partial(self, text: str, tags: list[str]) -> int:
        """How many of text's last characters could begin a tag (held for the next piece)."""
        longest = 0
        for tag in tags:
            for size in range(min(len(tag) - 1, len(text)), 0, -1):
                if text.endswith(tag[:size]):
                    longest = max(longest, size)
                    break
        return longest

    def take(self, text: str) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        rest = self.held + text
        self.held = ""

        def add(kind: str, piece: str) -> None:
            if not piece:
                return
            if kind == "think":
                self.thought += len(piece)
            if out and out[-1][0] == kind:
                out[-1] = (kind, out[-1][1] + piece)
            else:
                out.append((kind, piece))

        while rest:
            if self.closing is not None:
                at = rest.find(self.closing)
                if at >= 0:
                    add("think", rest[: at + len(self.closing)])
                    rest = rest[at + len(self.closing) :]
                    self.closing = None
                    continue
                keep = self._partial(rest, [self.closing])
                add("think", rest[: len(rest) - keep])
                self.held = rest[len(rest) - keep :]
                break
            found = [(rest.find(opening), opening, closing) for opening, closing in PAIRS if opening in rest]
            if found:
                at, opening, closing = min(found)
                add("answer", rest[:at])
                add("think", opening)
                rest = rest[at + len(opening) :]
                self.closing = closing
                continue
            keep = self._partial(rest, [opening for opening, _closing in PAIRS])
            add("answer", rest[: len(rest) - keep])
            self.held = rest[len(rest) - keep :]
            break
        return out

    def end(self) -> list[tuple[str, str]]:
        """What is held at the stream's end, and the closing tag of a block left open."""
        out: list[tuple[str, str]] = []
        if self.held:
            out.append(("think" if self.inside else "answer", self.held))
            self.held = ""
        if self.closing is not None:
            out.append(("think", self.closing))
            self.closing = None
        return out

    def over_budget(self) -> bool:
        return self.thought > int(THINKING["max_chars"])
