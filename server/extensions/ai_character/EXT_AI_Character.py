# SPDX-License-Identifier: AGPL-3.0-or-later
"""ai_character extension definition."""

from typing import ClassVar

from zephyrex.extensions.AbstractExtensionProvider import AbstractStaticExtension
from zephyrex.lib.Dependencies import Dependencies, EXT_Dependency


class AICharacterExtension(AbstractStaticExtension):
    name: ClassVar[str] = "ai_character"
    version: ClassVar[str] = "0.1.0"
    description: ClassVar[str] = "Character cards and personas for Zephyrex RPG AI"
    dependencies: ClassVar[Dependencies] = Dependencies(
        [
            EXT_Dependency(
                name="ai_lorebook",
                friendly_name="Lorebooks",
                reason="A character's own lorebook",
                optional=False,
                semver=None,
            ),
        ]
    )
