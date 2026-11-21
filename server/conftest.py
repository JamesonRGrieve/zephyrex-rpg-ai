# SPDX-License-Identifier: AGPL-3.0-or-later
"""Test configuration for the Zephyrex RPG AI server.

Prepends ``./extensions`` to the ``zephyrex.extensions`` namespace path so
``from zephyrex.extensions.ai_chat... import ...`` resolves to this repo.
"""

import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet

_extensions_dir = Path(__file__).resolve().parent / "extensions"

# The roots the framework searches, in order, as rpg_ai_app.EXTENSIONS_PATH lists them: this product's
# own, then the VTT's and the wiki's checkouts beside it (os.pathsep-joined, as EXTENSIONS_PATH takes them).
_suite = Path(__file__).resolve().parent.parent.parent
_lower = ("zephyrex-vtt", "zephyrex-rpg-wiki")
_roots = [_extensions_dir, *(_suite / product / "server" / "extensions" for product in _lower)]
os.environ.setdefault("EXTENSIONS_PATH", os.pathsep.join(str(root) for root in _roots))
os.environ.setdefault("DATABASE_TYPE", "sqlite")
# One database per xdist worker: each worker boots its own app and seeds it.
# Assigned, never setdefault: a DATABASE_NAME already in the environment would put every xdist
# worker on one database, which they then seed twice (intermittent "multiple ...Model" 409s).
os.environ["DATABASE_NAME"] = f"test_rpg_ai_{os.environ.get('PYTEST_XDIST_WORKER', 'main')}"
os.environ.setdefault("DATABASE_PATH", tempfile.mkdtemp(prefix="rpg-ai-db-"))
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-32-bytes-or-more-aaaaaa")
os.environ.setdefault("SEED_DATA", "true")
# The framework refuses to boot extensions that encrypt at rest without a key; a throwaway one per run.
os.environ.setdefault("FRAMEWORK_FERNET_KEY", Fernet.generate_key().decode())

import zephyrex.extensions  # noqa: E402

# The suite's lower products (docs/SUITE.md, Together): their extensions resolve from the same namespace.
for _root in map(str, _roots):
    if _root not in zephyrex.extensions.__path__:
        zephyrex.extensions.__path__ = [*zephyrex.extensions.__path__, _root]
if str(_extensions_dir) in zephyrex.extensions.__path__:
    zephyrex.extensions.__path__.remove(str(_extensions_dir))
zephyrex.extensions.__path__ = [str(_extensions_dir), *zephyrex.extensions.__path__]


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limit_counts_between_tests() -> None:
    """Each test starts with no sign-ins counted against the rate limits, as in the framework's own
    conftest: every test signs in from the same test-client address, so earlier tests' sign-ins
    (10 a minute) would refuse later ones."""
    from zephyrex.lib.InboundSecurity import reset_rate_limit_counts

    reset_rate_limit_counts()
