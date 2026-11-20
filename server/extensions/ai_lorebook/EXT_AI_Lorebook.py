# SPDX-License-Identifier: AGPL-3.0-or-later
"""ai_lorebook extension definition."""

from typing import ClassVar

from zephyrex.extensions.AbstractExtensionProvider import AbstractStaticExtension
from zephyrex.lib.Dependencies import Dependencies


class AILorebookExtension(AbstractStaticExtension):
    name: ClassVar[str] = "ai_lorebook"
    version: ClassVar[str] = "0.1.0"
    description: ClassVar[str] = "Lorebooks (World Info) and their entries for Zephyrex RPG AI"
    dependencies: ClassVar[Dependencies] = Dependencies([])
