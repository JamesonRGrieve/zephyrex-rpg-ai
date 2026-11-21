# SPDX-License-Identifier: AGPL-3.0-or-later
"""Sign-in through the operator's identity provider (the operator, 2026-11-21: Zephyrex's Authentik).

The framework's oauth_consumer signs people in through a provider instance, and reads a root
instance's client id, secret and issuer from the server's environment (OIDC_CONSUMER_ISSUER_URL,
OIDC_CONSUMER_CLIENT_ID, OIDC_CONSUMER_CLIENT_SECRET), but creates no instance itself. At startup,
when the issuer is set and oauth_consumer is loaded, this makes sure the operator's instance
exists: an ``oidc`` instance named ``SIGN_IN_INSTANCE`` (the client's button and the redirect URI
<APP_URI>/user/close/<name> both use the name). Its settings stay in the environment.
"""

from typing import Any

from zephyrex.lib.Environment import env
from zephyrex.lib.Logging import logger

SIGN_IN_INSTANCE = "authentik"


def ensure_sign_in_instance(as_requester: Any) -> bool:
    """Create the operator's OIDC instance when the issuer is configured and none exists; whether one exists after."""
    if not (env("OIDC_CONSUMER_ISSUER_URL") or "").strip():
        return False
    from zephyrex.logic.BLL_Providers import ProviderInstanceManager, ProviderManager

    root_id = env("ROOT_ID")
    record = as_requester(ProviderManager, root_id).get(name="oidc")
    instances = as_requester(ProviderInstanceManager, root_id)
    found = instances.list(name=SIGN_IN_INSTANCE, provider_id=record.id)
    if found:
        return True
    instances.create(name=SIGN_IN_INSTANCE, provider_id=record.id, scope="root")
    logger.info(f"Created the {SIGN_IN_INSTANCE} sign-in instance (oidc), its settings from the environment")
    return True
