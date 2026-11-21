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

    @classmethod
    def on_start(cls) -> None:
        """The operator's sign-in instance (SignIn), when oauth_consumer is loaded and its issuer set."""
        from fastapi import HTTPException
        from zephyrex.extensions.ai_chat.SignIn import ensure_sign_in_instance  # type: ignore[import-not-found]
        from zephyrex.lib.Logging import logger

        try:
            ensure_sign_in_instance(cls.as_requester)
        except HTTPException as error:
            # No oauth_consumer (no oidc provider), or no app yet: sign-in by email link still works.
            logger.warning(f"No sign-in instance: {error.detail}")
