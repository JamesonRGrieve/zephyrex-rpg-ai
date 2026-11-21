# SPDX-License-Identifier: AGPL-3.0-or-later
"""ai_chat extension definition."""

from typing import ClassVar

from zephyrex.extensions.AbstractExtensionProvider import AbstractStaticExtension
from zephyrex.lib.Dependencies import Dependencies, EXT_Dependency


class AIChatExtension(AbstractStaticExtension):
    name: ClassVar[str] = "ai_chat"
    version: ClassVar[str] = "0.1.0"
    description: ClassVar[str] = "Chats, messages, presets, model endpoints and streamed generation for Zephyrex RPG AI"
    dependencies: ClassVar[Dependencies] = Dependencies(
        [
            EXT_Dependency(
                name="ai_character",
                friendly_name="Characters",
                reason="A chat's cast and personas",
                optional=False,
                semver=None,
            ),
            EXT_Dependency(
                name="ai_memories",
                friendly_name="Memories",
                reason="A chat's older lines, recalled by meaning (A19)",
                optional=False,
                semver=None,
            ),
        ]
    )
