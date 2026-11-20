# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zephyrex RPG AI's SaaS backend: a consumer app built on the Zephyrex framework.

All infrastructure (auth, DB, REST, migrations, AI) comes from the framework; this project adds
the ai_character and ai_chat extensions. The client (../client, built with RPG_AI_VARIANT=saas)
proxies /api/v1/* here.

    uv run python rpg_ai_app.py                                    # boot with uvicorn
    uv run python -c "from rpg_ai_app import create; create()"    # programmatic
"""

from __future__ import annotations

import os

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

# From the framework: auth_session and auth_magic_link (sign-in by email link), email to send
# those links, genealogy (a character can be a person in the world). ai_lorebook, ai_character and
# ai_chat (this repo) add what only Zephyrex RPG AI needs.
EXTENSIONS = "auth_session,auth_magic_link,email,genealogy,ai_lorebook,ai_character,ai_chat"
EXTENSIONS_PATH = "./extensions"
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
