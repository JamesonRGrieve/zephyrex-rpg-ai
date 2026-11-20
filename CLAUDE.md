# Zephyrex RPG AI

AI roleplay and an AI game master (SillyTavern parity) on the Zephyrex framework. It is the
top of the Zephyrex RPG suite (wiki ← vtt ← ai).

- Suite ownership and composition: `docs/SUITE.md`.
- Design: `docs/DESIGN.md`.

## Structure

```
server/     Python backend: zephyrex server consumer (PyPI `zephyrex[genealogy]~=0.0.1`); extensions in server/extensions/
client/     Next.js frontend: zephyrex npm consumer
docs/       SUITE.md, DESIGN.md
```

## Rules for this repo

- **This product's extensions only.**
  - Anything generic goes in the frameworks: pool dispatch, the `decide` capability and room
    sync are framework work (card 253).
  - The wiki and VTT are reached through their APIs and abilities, never their internals.
- **Mechanics are never invented by a model.**
  - Rolls, legal actions and state changes go through the VTT.
  - Decision models choose only from the options the caller supplies.
- **OOC never enters the story context.** Channels are set on every message (`docs/DESIGN.md`,
  *Out-of-character*).
- **Pages never branch on edition** or on which suite products are loaded. A feature shows when
  `GET /v1/extension` lists the extension that serves it.
- **UI follows the shared standard:** zephyrex design tokens, shadcn, lucide, and a Storybook
  story with a `play` test per component, as in 16 Worldviews, Zephyreader and Chronos.
- **Heavy work** (installs, builds, test suites) runs on the build runner, never the desktop.
- **Before a first edit,** read the SOP Stack Standards (Python; TypeScript and JavaScript;
  React and Next.js). The self-hosted model servers belong to Self Hosted AI (AI Lab card 182).
  Work state: card 256 on Zephyrex Software.

## Commands

```bash
cd server && pip install -e ".[dev]" && python app.py
cd server && python -m pytest extensions/
cd client && pnpm install && pnpm dev
```
