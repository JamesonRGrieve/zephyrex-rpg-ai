# The Zephyrex RPG suite

`zephyrex-rpg` splits into three products (operator, 2026-11-20). Each one is a full
app on its own, and the three compose into one table when they run together.
`zephyrex-vtt` and `zephyrex-rpg-wiki` are carved out of this repo with their history.
This repo then becomes `zephyrex-rpg-ai`. Each repo is private on the Zephyrex Forgejo,
push-mirrored to GitHub and deployed by Forgejo Actions, as 16 Worldviews and Chronos are.

| Product | Competes with | What it is |
|---|---|---|
| **zephyrex-rpg-wiki** | Kanka, World Anvil | The world: worldbuilding, campaign records, lore, timelines, maps for reading. |
| **zephyrex-vtt** | Foundry VTT, Roll20, Inkarnate | The table: authored maps and battlemaps, scenes, tokens, character sheets, dice, combat, live multi-player play. |
| **zephyrex-rpg-ai** | SillyTavern | The voices: AI characters and an AI game master that play inside the world and at the table, using the other two. |

Design docs:

- [zephyrex-rpg-wiki: docs/DESIGN.md](https://github.com/JamesonRGrieve/zephyrex-rpg-wiki/blob/main/docs/DESIGN.md)
- [zephyrex-vtt: docs/DESIGN.md](https://github.com/JamesonRGrieve/zephyrex-vtt/blob/main/docs/DESIGN.md)
- [DESIGN.md](DESIGN.md) (this repo, zephyrex-rpg-ai)

The entity model they share stays in [zephyrex-rpg-wiki: server/OBJECT_PLAN.md](https://github.com/JamesonRGrieve/zephyrex-rpg-wiki/blob/main/server/OBJECT_PLAN.md).
Model fields are defined there once, and these docs cite its sections rather than
repeating them. Build order (operator, 2026-11-20): the AI product is built first. Its
work is then ported back to the wiki and the VTT.

## Ownership: which repo owns which extension

A dependency only points down the stack: wiki ← vtt ← ai. The wiki depends on neither
of the others. The VTT reads the wiki (a scene sits on a map of a location, and a token
is a person). The AI product reads and writes both.

| Extension (OBJECT_PLAN name) | Owner | Why there |
|---|---|---|
| `entity_posts`, `world_taxonomy`, `world_narrative`, `world_social`, `world_inventory` | wiki | Kanka/World Anvil's core. |
| `world_spatial`: locations, maps, layers, groups, pins | wiki | Kanka maps: an image or a published render, with pins. |
| `world_spatial`: map **authoring** (stamps, variants, terrain regions, paths, interaction hooks) | vtt, as `vtt_cartography` | The operator named the VTT as the Inkarnate competitor. The editor and its data move together. A finished map is *published* to a wiki map as a render plus pins. |
| `rpg_core`: campaigns | wiki | A campaign is the top-level container in Kanka and World Anvil, and every product scopes to it. |
| `rpg_core`: game systems, character injection; `rpg_traits`, `rpg_scene`, `rpg_dice`, `rpg_combat`, `rpg_cards` | vtt | Mechanics and play. |
| `rpg_log` (exists) | wiki (operator, 2026-11-20) | The campaign's history: encounter, combat, dialogue, interaction and transaction logs, next to session reports. It sits below the VTT, so its references to VTT records (combatants, encounters, traits) are polymorphic `target_entity_type + target_entity_id` (OBJECT_PLAN §7), never foreign keys into a VTT table. The VTT and the AI GM write to it. |
| `rpg_state` (exists) | split per OBJECT_PLAN §6 into the rows above | |
| `ai_character`, `ai_lorebook`, plus the GM, table and decision extensions in [DESIGN.md](DESIGN.md) | ai | SillyTavern's surface. |
| `calendar`, `conversations`, `media`, `maps`, `genealogy`, `live_sync`, `ai*`, `entitlements`, `cloud` | **framework** | Already shipped in server-framework (`36bb425e`). OBJECT_PLAN marked some of these `[NEW]`. Each product uses the framework's, and extends it only where a field is RPG-specific. |

The framework already serves the generic Tier-0 concerns, so this repo does not build
them again. Before an OBJECT_PLAN `[NEW]` Tier-0 model is built, its framework namesake is
checked field by field (Outstanding on card 256).

## How the three compose

Each product is a zephyrex server consumer, a package of server extensions, and a zephyrex
npm consumer, a package of client extensions:

- **Standalone.** Each app installs only its own packages and its dependencies below it.
  The VTT pulls the wiki's extensions, because a scene needs a location. The wiki's pages
  are present but are not the focus of its navigation.
- **Together.** One server loads all three packages' extensions, and one client lists all
  three packages' client extensions. One database, one session, one campaign.
- **Capabilities, never editions.** As in Chronos and Zephyreader, a page shows a feature
  when `GET /v1/extension` lists the extension that serves it. The AI product's "show me the
  map" works when the VTT extension is loaded and is absent when it is not. Pages never
  branch on which product they run in.
- **Cross-product calls go through the API contract**, never through another repo's
  internals. The AI GM reads lore with the wiki's REST/GraphQL and rolls dice with the VTT's
  endpoints, under the same ACL as a human.

## Editions

All three follow the house pattern of one front end and two builds:

- **Lite** (`<APP>_VARIANT=lite`, the default): self-hosted, for one person or a home
  table. The `route.lite.ts` handlers answer `/api/v1/*` from SQLite.
- **SaaS** (`<APP>_VARIANT=saas`): the same UI, with `/api/v1/*` proxied to `server/`.
  Accounts, teams, sync, plans and the heavy features.

What each edition holds is in each design's *Editions* section. Shared limits and the rules'
cases live in each repo's `contract/` (the Chronos pattern), and both back ends test
against them.

## The UI standard, common to all three

The bar is the shipped sibling apps: 16 Worldviews, Zephyreader and Chronos.

- **Design system:** the framework's tokens and base styles (`@import 'zephyrex/styles.css'`,
  Tailwind v4 `@source` over the compiled framework packages), shadcn/radix primitives,
  `lucide-react` icons. No second component kit.
- **Brand:** each product has its own mark as an SVG React component in `src/brand/`, plus a
  fixed-colour `src/app/icon.svg`. The mark is decorative (`aria-hidden`), and the name
  always stands beside it.
- **Marketing front door:** `/` is a real landing page for visitors, built from the
  16 Worldviews set: site header, hero with a live sample, feature cards, comparison against
  the competitor, pricing card, FAQ, CTA band and footer. A signed-in person goes straight to
  their workspace.
- **App shell:** a shared `AppPage` frame with a fixed layout, the same controls in the same
  places and no surprise pop-ups. Keyboard reachable throughout.
- **Every component has a Storybook story with a `play` test**, and the important flows have
  Playwright e2e. `@playwright/test` is pinned to the runners' browser build (SOP *Zephyrex
  Framework SaaS Launch*).
- **Accessibility as a feature:** reduced motion that follows the OS, a high-contrast
  option, scalable type, and screen-reader labels on canvas tools. A canvas always has a
  list or outline equivalent (tokens, pins and walls as a list).
- **Visual identity per product, one family:**
  - **wiki:** editorial. A reading surface tuned for long prose, a serif display face,
    generous measure, light and dark.
  - **vtt:** canvas first. Dark chrome that recedes around the map, floating tool palettes,
    dense HUDs.
  - **ai:** conversation first. A chat column with character presence (portraits,
    expression sprites), and the world and table in side drawers.
- **SPDX headers** on every file (`AGPL-3.0-or-later`, as in the siblings).

## Repository shape (each of the three)

```
client/    Next.js on the zephyrex npm package; lite and saas builds
server/    zephyrex server consumer; this product's extensions only
contract/  limits, enums and rule cases both back ends test against
deploy/    the Cule/Zephyreader deploy shape (SOP: Zephyrex Framework SaaS Launch)
docs/      FEATURES.md (parity matrix), DESIGN.md, research/competitors.md
```

Repo creation (each repo's `forgejo_repository` in its own `svc_<app>.tf`), the GitHub
mirrors, the carve-out and this repo's rename are tracked on card 256.
