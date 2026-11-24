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

    @classmethod
    def on_start(cls) -> None:
        """A playthrough started from a scenario gets the scenario's frame: the copy registered with the wiki's
        published register_instantiate_hook (BLL_AI_Campaign.register_frame_copy)."""
        from zephyrex.extensions.ai_campaign.BLL_AI_Campaign import (  # type: ignore[import-not-found]
            register_frame_copy,
        )
        from zephyrex.lib.Environment import env
        from zephyrex.lib.Logging import logger
        from zephyrex.pydantic2.registry import ModelRegistry

        try:
            registry = ModelRegistry.attached()
            if registry is not None and not register_frame_copy(registry, str(env("ROOT_ID"))):
                logger.warning("ai_campaign: the wiki offers no register_instantiate_hook; frames aren't copied")
        except Exception as error:  # the copy is extra: the app boots without it
            logger.warning(f"ai_campaign: no frame copy on instantiate: {error}")
