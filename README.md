# zephyrex-rpg-ai

AI roleplay and an AI game master on the Zephyrex framework. It plays a campaign with you: an AI GM, an AI
party, and the people of the world, each in their own voice. It aims at full feature parity with
SillyTavern (character cards, lorebooks, presets, swipes, branches, group chats, STscript, extensions) and adds
what SillyTavern doesn't have:

- a real world, from the wiki;
- real mechanics, from the VTT: rolls, sheets and fights are the VTT's, never invented by a model;
- decision models that run the table (who speaks next, whether a roll or a fight starts), every call kept and
  shown;
- out-of-character table talk and questions to the GM that never enter the story;
- a player's view of the world: from a character's seat, only what that character knows.

It is the top of the Zephyrex RPG suite:

- [zephyrex-rpg-wiki](https://github.com/JamesonRGrieve/zephyrex-rpg-wiki): the world.
- [zephyrex-vtt](https://github.com/JamesonRGrieve/zephyrex-vtt): the table.
- **zephyrex-rpg-ai**: the voices. It reads and writes the other two through their APIs.

## Documentation

- **The guide and the developer docs** are in Storybook, beside every component's story: run
  `cd client && pnpm storybook`. The wiki's and the VTT's guides are composed into it from their checkouts
  beside this one.
- [docs/DESIGN.md](docs/DESIGN.md): the design and the operator's rulings.
- [docs/SUITE.md](docs/SUITE.md): how the three products divide and compose.

## Layout

```
server/   Python backend: the zephyrex server framework, this product's extensions in server/extensions/
client/   Next.js frontend: the zephyrex client framework; components, stories and the MDX guide in src/
contract/ The shared contract and the decision models' cases
deploy/   The pinned frameworks (frameworks.env), the build and ship scripts
docs/     SUITE.md, DESIGN.md
```

## Running

```bash
cd server && pip install -e ".[dev]" && python app.py     # API on :2000
cd client && pnpm install && pnpm dev                       # UI on :1109
cd client && pnpm storybook                                 # Storybook on :6006
```

The client depends on the framework packages and the suite's client packages checked out as siblings
(`../client-framework`, `../auth`, `../zod2gql`, `../dynamic-form`, `../zephyrex-rpg-wiki`, `../zephyrex-vtt`)
through `file:` paths. The deployed set is pinned in `deploy/frameworks.env`.

## Tests

Run only what a change touches; full suites run in the release candidate's CI.

```bash
cd server && python -m pytest extensions/<extension>
cd client && pnpm exec vitest related --run <changed files>
cd client && pnpm storybook-test                            # story play tests, against a running Storybook
```

## License

[AGPL-3.0-or-later](./server/LICENSE)
