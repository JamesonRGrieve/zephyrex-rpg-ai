# SPDX-License-Identifier: AGPL-3.0-or-later
"""The SaaS server for the end-to-end suite (client/playwright.config.ts starts it).

It boots the real app on a throwaway SQLite database and configures what a deployment's
operator would, except mail: each magic link the server would email is written to the
suite's outbox instead (one file per address, the newest link last), through the magic-link
extension's send listener. People still sign in through the pages: the test reads the link
from the outbox and opens it, as a person opens it from their inbox.

    uv run python e2e_server.py --port 47201 --client http://127.0.0.1:47203 --outbox /tmp/outbox
"""

from __future__ import annotations

import argparse
import os
import secrets
import shutil
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet


def configure_environment(port: int, client: str) -> None:
    scratch = tempfile.mkdtemp(prefix="rpg-ai-e2e-server-", dir=os.environ.get("E2E_SCRATCH"))
    os.environ.update(
        {
            "ENVIRONMENT": "development",
            "DATABASE_TYPE": "sqlite",
            "DATABASE_NAME": "e2e",
            "DATABASE_PATH": scratch,
            "SEED_DATA": "true",
            "JWT_SECRET": secrets.token_urlsafe(48),
            "FRAMEWORK_FERNET_KEY": Fernet.generate_key().decode(),
            "APP_URI": client,
            "APP_CORS_ALLOWED_ORIGINS": client,
            "ALLOWED_DOMAINS": "*",
            "TRUSTED_PROXIES": "127.0.0.1/32,::1/128",
            # The links land on the client's magic-link page (@zephyrex/auth-magic-link).
            "MAGIC_LINK_BASE_URL": f"{client}/user/magic",
            "RPG_AI_SERVER_PORT": str(port),
        }
    )


def capture_links(outbox: Path) -> None:
    """Writes every magic link the server sends to ``outbox/<email>``, newest last."""
    from zephyrex.extensions.auth_magic_link.BLL_Auth_MagicLink import register_send_listener

    shutil.rmtree(outbox, ignore_errors=True)
    outbox.mkdir(parents=True)

    def listener(*, email: str, magic_link_url: str, raw_token: str) -> None:
        del raw_token  # the URL carries it
        with (outbox / email.lower()).open("a", encoding="utf-8") as sent:
            sent.write(f"{magic_link_url}\n")

    register_send_listener(listener)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--client", required=True)
    parser.add_argument("--outbox", type=Path, required=True)
    args = parser.parse_args()
    configure_environment(args.port, args.client)
    capture_links(args.outbox)

    import uvicorn

    from rpg_ai_app import API_ROOT_PATH, create

    uvicorn.run(create(), host="127.0.0.1", port=args.port, log_level="warning", root_path=API_ROOT_PATH)


if __name__ == "__main__":
    main()
