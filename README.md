# zephyrex-rpg-ai

AI roleplay and an AI game master, built on the Zephyrex framework. It is planned for full
feature parity with SillyTavern: character cards, lorebooks, presets, swipes, branches,
group chats, STscript, extensions.

It adds what SillyTavern does not have:

- a real world, from the wiki;
- real mechanics, from the VTT;
- out-of-character table talk with the GM;
- model pools across several servers;
- Jev-style decision models for combat.

It is one of three products in the Zephyrex RPG suite:

- [zephyrex-rpg-wiki](https://github.com/JamesonRGrieve/zephyrex-rpg-wiki): the world.
- [zephyrex-vtt](https://github.com/JamesonRGrieve/zephyrex-vtt): the table.
- **zephyrex-rpg-ai**: the voices. It reads and writes the other two through their APIs.

Status: design stage. Read [docs/DESIGN.md](docs/DESIGN.md), and
[docs/SUITE.md](docs/SUITE.md) for how the three products divide and compose. The
worldbuilding and mechanics code that used to live here moved, with its history, to
zephyrex-rpg-wiki (`rpg_log`, the entity plan) and zephyrex-vtt (`rpg_state`).

## Layout

```
server/   FastAPI backend, a consumer of the zephyrex Python package
client/   Next.js frontend, a consumer of the zephyrex npm package
docs/     SUITE.md, DESIGN.md
```

## Running

```bash
cd server && pip install -e ".[dev]" && python app.py     # API on :2000
cd client && pnpm install && pnpm dev                       # UI on :1109
```

The client depends on the framework packages checked out as siblings (`../client-framework`,
`../auth`, `../zod2gql`, `../dynamic-form`) through `file:` paths.

## License

[AGPL-3.0-or-later](./server/LICENSE)
