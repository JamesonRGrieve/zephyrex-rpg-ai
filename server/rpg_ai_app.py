# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zephyrex RPG AI's SaaS backend: a consumer app built on the Zephyrex framework.

All infrastructure (auth, DB, REST, migrations, AI) comes from the framework. It runs composed
with the wiki and the VTT (docs/SUITE.md): one server loads their extensions with its own. The
client (../client, built with RPG_AI_VARIANT=saas) proxies /api/v1/* here.

    uv run python rpg_ai_app.py                                    # boot with uvicorn
    uv run python -c "from rpg_ai_app import create; create()"    # programmatic
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI

os.environ.setdefault("APP_NAME", "Zephyrex RPG AI")
os.environ.setdefault("DATABASE_TYPE", "sqlite")
os.environ.setdefault("DATABASE_NAME", "zephyrex_rpg_ai")
os.environ.setdefault("SEED_DATA", "true")
# Development only; every deployment sets its own from OpenBao.
os.environ.setdefault("JWT_SECRET", "dev-only-change-in-production-32chars!")
# The client proxies /api/v1 here; the browser's writes are same-site only by the public origin.
os.environ.setdefault("APP_CORS_ALLOWED_ORIGINS", "http://localhost:1109")
# Every browser request arrives through the client's proxy on this host.
os.environ.setdefault("TRUSTED_PROXIES", "127.0.0.1/32,::1/128")
# Attachments' storage (the wiki's pictures and files) in development; every deployment sets its own.
os.environ.setdefault("CLOUD_LOCAL_DIRECTORY", str(Path(__file__).resolve().parent / ".cloud"))

# The suite, composed (docs/SUITE.md, Together; the operator, 2026-11-21): one server with the
# wiki's and the VTT's extensions, in dependency order.
# - framework: sessions and sign-in links, email, genealogy (persons), acl_rbac, conversations and
#   rooms (the VTT's tables, whispers and live scene and table rooms), cloud and attachments
#   (pictures and files on records), metadata (record properties), ai_memories (recall by meaning,
#   A19);
# - the wiki: places, factions and relationships, items, journals and hooks, tags and statuses,
#   property kits, posts, rpg_core (campaigns, settings, the person fields). rpg_log stays out: it
#   still imports the retired rpg_state;
# - the VTT: game systems, traits, modules, dice and tests, scenes, tables;
# - this product: ai_lorebook, ai_character and ai_campaign until they move into the wiki (docs/DESIGN.md,
#   The composed suite), and ai_chat.
_FRAMEWORK = [
    "auth_session",
    "auth_magic_link",
    "email",
    "genealogy",
    "acl_rbac",
    "conversations",
    "rooms",
    "cloud",
    "attachments",
    "metadata",
    "ai_memories",
]
_WIKI = [
    "world_spatial",
    "world_social",
    "world_inventory",
    "world_narrative",
    "world_taxonomy",
    "world_properties",
    "entity_posts",
    "rpg_core",
]
# rpg_dice depends on rpg_modules (VTT da7c8fa: a module's traits count only where it is enabled).
_VTT = ["rpg_systems", "rpg_traits", "rpg_modules", "rpg_dice", "rpg_scene", "rpg_table", "rpg_combat"]
_AI = ["ai_lorebook", "ai_character", "ai_campaign", "ai_chat"]
EXTENSIONS = ",".join(_FRAMEWORK + _WIKI + _VTT + _AI)
# Sign-in through the operator's identity provider (Authentik; ai_chat/SignIn.py), when one is
# configured: oauth_consumer needs FRAMEWORK_FERNET_KEY and the OIDC_CONSUMER_* settings, so it is
# loaded only where its issuer is set.
if os.environ.get("OIDC_CONSUMER_ISSUER_URL", "").strip():
    EXTENSIONS = f"auth_session,oauth_consumer,{EXTENSIONS.removeprefix('auth_session,')}"

_HERE = Path(__file__).resolve().parent


def _suite_root(product: str) -> str:
    """A lower product's extensions: in a deployed bundle under app/suite/, in a checkout beside this
    repository (deploy/fetch-frameworks.sh lays both out the way the repositories are)."""
    bundled = _HERE / "suite" / product / "server" / "extensions"
    return str(bundled if bundled.is_dir() else _HERE.parent.parent / product / "server" / "extensions")


# Where extensions are found, in order: this product's own, then the VTT's, then the wiki's. The same
# name in two roots fails the boot (server-framework's DuplicateExtensionError).
EXTENSIONS_PATH = [str(_HERE / "extensions"), _suite_root("zephyrex-vtt"), _suite_root("zephyrex-rpg-wiki")]
SERVER_PORT = int(os.environ.get("RPG_AI_SERVER_PORT", "2000"))
# Loopback only: browsers reach the server through the client's /api proxy on the same host.
SERVER_HOST = os.environ.get("RPG_AI_SERVER_HOST", "127.0.0.1")
# The client proxies its same-origin /api/v1/* to this server's /v1/*.
API_ROOT_PATH = "/api"


def create() -> FastAPI:
    """Return a FastAPI app instance for testing or ASGI mounting."""
    from zephyrex import instance, set_extensions_root

    set_extensions_root(EXTENSIONS_PATH)
    app = instance(extensions=EXTENSIONS)
    if not isinstance(app, FastAPI):
        raise TypeError(f"zephyrex.instance() returned {type(app).__name__}, expected FastAPI")
    return app


if __name__ == "__main__":
    from zephyrex import run

    run(
        extensions=EXTENSIONS,
        extensions_path=EXTENSIONS_PATH,
        host=SERVER_HOST,
        port=SERVER_PORT,
        root_path=API_ROOT_PATH,
    )
