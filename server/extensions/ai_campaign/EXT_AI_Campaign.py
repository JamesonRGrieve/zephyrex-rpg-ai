# SPDX-License-Identifier: AGPL-3.0-or-later
"""ai_campaign extension definition."""

from typing import ClassVar

from zephyrex.extensions.AbstractExtensionProvider import AbstractStaticExtension
from zephyrex.lib.Dependencies import Dependencies


class AICampaignExtension(AbstractStaticExtension):
    name: ClassVar[str] = "ai_campaign"
    version: ClassVar[str] = "0.1.0"
    description: ClassVar[str] = "Campaign frames for Zephyrex RPG AI: the table's agreement the GM reads every turn"
    dependencies: ClassVar[Dependencies] = Dependencies([])
