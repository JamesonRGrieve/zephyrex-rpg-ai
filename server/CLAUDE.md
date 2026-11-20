# Zephyrex RPG AI server

Consumer project built on the zephyrex server framework. Provides Zephyrex RPG AI's domain extensions — the framework handles all infrastructure.

## Architecture

This is a **consumer project**, not a framework fork. It depends on
`zephyrex[ai,auth-magic-link,auth-session,email,genealogy]` as a path source,
`../../server-framework` (`[tool.uv.sources]`), checked out at the commit `deploy/frameworks.env`
pins (`deploy/fetch-frameworks.sh`). Locked in `uv.lock`. It provides only domain extensions,
loaded by `rpg_ai_app.py` (`EXTENSIONS`):

- **ai_character**, **ai_lorebook**, **ai_campaign**, **ai_chat** — this product's models and logic;
  see docs/DESIGN.md (Progress) for what each covers
- **rpg_log**, **rpg_state** — shared with the suite (docs/SUITE.md)
- framework extensions: auth_session, auth_magic_link, email, genealogy

Twin logic that the lite edition also runs is held to the case files in `contract/`
(e.g. `Instruct.py`, `Speech.py`, `Tokenize.py`, `Search.py` against `*-cases.json`).

## Commands

```bash
uv sync --frozen             # Install from uv.lock (framework at its pinned checkout)
python rpg_ai_app.py         # Boot the server
python -m pytest -o addopts= extensions/ai_chat/Search_test.py   # Run only the tests a change touches
```

Tests run on the build runner, on a copy, never the desktop; run only the test files a change
touches (the operator, 2026-11-20).

## How it works

`rpg_ai_app.py` builds the framework app with `EXTENSIONS` from `./extensions`. The framework:

1. Discovers `BLL_*.py` models in `./extensions/<name>/`
2. Auto-generates SQLAlchemy tables
3. Auto-generates REST CRUD endpoints at `/v1/<resource>`
4. Auto-generates GraphQL schema
5. Provides core auth (User, Team, Role, Session) out of the box
