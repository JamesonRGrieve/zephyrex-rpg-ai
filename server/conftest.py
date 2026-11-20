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

os.environ.setdefault("EXTENSIONS_PATH", str(_extensions_dir))
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

if str(_extensions_dir) not in zephyrex.extensions.__path__:
    zephyrex.extensions.__path__ = [str(_extensions_dir), *zephyrex.extensions.__path__]


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limit_counts_between_tests() -> None:
    """Each test starts with no sign-ins counted against the rate limits, as in the framework's own
    conftest: every test signs in from the same test-client address, so earlier tests' sign-ins
    (10 a minute) would refuse later ones."""
    from zephyrex.lib.InboundSecurity import reset_rate_limit_counts

    reset_rate_limit_counts()
