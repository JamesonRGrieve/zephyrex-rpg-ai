# zephyrex-rpg-ai: design

An AI roleplay and AI game-master app that competes with SillyTavern. It plays inside a real
world (the wiki) and at a real table (the VTT), so its characters remember canon, keep
secrets and roll real dice. It is built first. The wiki and VTT get its shared pieces
ported back. Suite context and ownership: [../SUITE.md](../SUITE.md). Entity fields for
cards and lorebooks: [OBJECT_PLAN](../../server/OBJECT_PLAN.md) §4 *Phase 4 — Tier AI*.

## The operator's requirements (2026-11-20)

> "When zephyrex RPG comes up, we need support for out of character messages to the GM
> agent, multiple models on multiple servers for parallelism, decision models like jev for
> combat decisions etc."

Each has its own section below:

- [Out-of-character messages to the GM agent](#out-of-character-ooc)
- [Multiple models on multiple servers](#multiple-models-on-multiple-servers)
- [Decision models (Jev-style)](#decision-models-jev-style)

"Jev" is defined in the Zephyrex SOP, *AI Environment → Decision models (Jev-style System-1)*.

## What sets it apart from SillyTavern

SillyTavern is the reference for depth of control: cards, lorebooks, presets, swipes,
branching, group chats, extensions. Its gaps are what this product fills:

1. **A world, not a pile of lorebooks.** Lore comes from the wiki's entities, under the wiki's
   secrets. Lorebooks are generated from the world (OBJECT_PLAN `ai_lorebook`
   `source_entity_*`) and stay in sync, instead of being hand-copied keyword lists.
2. **Real mechanics.** The GM does not make up a roll. It asks the VTT, which rolls on the
   server, and narrates the result. HP, conditions and positions live on the VTT.
3. **A GM you can talk to as a GM.** Out-of-character table talk is a first-class channel,
   separate from the story.
4. **Many models at once.** A turn fans out across several models on several servers: a big
   narrator, smaller NPC voices, a tiny decision layer. It is not one model doing
   everything in sequence.
5. **Decisions you can inspect.** Combat choices come from typed decision models, with
   options, choice, confidence and the fallback shown. There is no "the goblin did something
   because the LLM said so".
6. **Multi-player.** Several humans at one AI-run table (SaaS), not a single-user desktop app.
7. **A finished UI.** Polished, accessible, installable, on phone and desktop.

## Modes

| Mode | Who plays | Who runs the world |
|---|---|---|
| **Character chat** | You, as your persona | One AI character (SillyTavern classic) |
| **Group chat** | You | Several AI characters, turn-taking by the `next_speaker` decision |
| **AI GM campaign** | One or more humans, each with a PC | The GM agent, with NPC agents for major NPCs |
| **AI party** | A human GM | AI characters as player characters |
| **GM assistant** | A human GM running a table | The AI supplies NPC voices, roll outcomes, recaps and "what do they know" answers on request |

Every mode runs on the same conversation and agent machinery, and differs only in seats and
grants.

## Feature parity matrix: full parity

**The target is full feature parity with SillyTavern** (operator, 2026-11-20): every
feature it offers, including its extension system and STscript, is planned here. Nothing
is left out of scope.

Sources: docs.sillytavern.app (features, extensions, the STscript and slash-command
reference) as of 2026-11. Rows marked *(verify)* are known from the product but not yet
confirmed against a current page. Every row is re-checked in `docs/research/competitors.md`
before launch. "Ours" marks what SillyTavern does not have.

| # | Feature | Seen in | Lite | SaaS |
|---|---|---|---|---|
| **Characters** |
| A1 | Character cards V2/V3: description, personality, scenario, first message, alternate greetings, examples, system prompt, post-history instructions, creator notes, extensions | SillyTavern | ✓ | ✓ |
| A2 | Import/export cards as PNG (embedded JSON) and JSON; batch import | SillyTavern | ✓ | ✓ |
| A3 | Personas: your own name, description and avatar, per chat or default | SillyTavern | ✓ | ✓ |
| A4 | Expression sprites and visual-novel mode (expression chosen by a decision model) | SillyTavern | ✓ | ✓ |
| A5 | Character linked to a wiki person: card fields filled from the entity; canon edits flow both ways | ours | ✓ | ✓ |
| **Chat** |
| A6 | Streaming replies; stop; continue; regenerate; impersonate | SillyTavern | ✓ | ✓ |
| A7 | Swipes (alternative replies per turn), kept and browsable | SillyTavern | ✓ | ✓ |
| A8 | Branches and checkpoints: fork from any message, tree view | SillyTavern | ✓ | ✓ |
| A9 | Edit, delete and move any message; bookmarks | SillyTavern | ✓ | ✓ |
| A10 | Group chats with turn order (manual, list, natural via decision model) | SillyTavern | ✓ | ✓ |
| A11 | Out-of-character channel and table notes (below) | ours | ✓ | ✓ |
| A12 | Chat search, chat library with folders and tags | SillyTavern | ✓ | ✓ |
| A13 | Import SillyTavern chats (JSONL) | — | ✓ | ✓ |
| **Context** |
| A14 | Lorebooks / World Info: the full SillyTavern entry surface (keys, secondary keys, logic, depth, position, order, probability, groups, sticky, cooldown, delay, recursion) | SillyTavern | ✓ | ✓ |
| A15 | Lorebooks generated from the wiki and kept in sync; entry relevance gated by a decision model on top of keys | ours | ✓ | ✓ |
| A16 | Author's note, system prompt override, prompt manager with ordered, toggleable sections and per-section token budgets | SillyTavern | ✓ | ✓ |
| A17 | Instruct and context templates; sampler presets per model | SillyTavern | ✓ | ✓ |
| A18 | Token counter and a context inspector: exactly what was sent, by section | SillyTavern | ✓ | ✓ |
| A19 | Long-term memory: rolling summaries and recall by meaning (framework `ai_memories`) | SillyTavern (Summarize, Vector Storage) | ✓ | ✓ |
| **Game** |
| A20 | AI GM agent with a configurable style (tone, pacing, difficulty, verbosity, person, content rating) | ours | ✓ | ✓ |
| A21 | Grounded mechanics: rolls, checks, damage and conditions through the VTT | ours | ✓ (with the VTT loaded) | ✓ |
| A22 | Decision models for combat and other typed choices, with a "why" panel | ours | ✓ | ✓ |
| A23 | Scene awareness: what each character can perceive, from the VTT scene | ours | ✓ (with the VTT loaded) | ✓ |
| A24 | Session reports and journals written back to the wiki | ours | ✓ | ✓ |
| A25 | Safety tools: lines and veils, X-card, pause, content rating | ours | ✓ | ✓ |
| **Models** |
| A26 | Any OpenAI-compatible endpoint, plus the framework's providers (Anthropic, OpenAI, Google, DeepSeek, xAI, Bifrost, local GGUF) | SillyTavern (many backends) | ✓ | ✓ |
| A27 | Model roles with pools of servers, parallel fan-out per turn (below) | ours | ✓ | ✓ |
| A28 | A model status page: each role's servers, load, latency, failures | ours | ✓ | ✓ |
| **Media** |
| A29 | Text to speech per character voice; speech to text input | SillyTavern | ✓ | ✓ |
| A30 | Image generation for scenes and portraits (ComfyUI and others through the framework) | SillyTavern | ✓ | ✓ |
| A31 | Backgrounds per chat or per wiki location | SillyTavern | ✓ | ✓ |
| **Automation** |
| A32 | Quick replies and macros (a safe, declarative subset in place of STscript) | SillyTavern | ✓ | ✓ |
| A33 | Regex transforms on input and output | SillyTavern | ✓ | ✓ |
| **Accounts** |
| A34 | Multi-player tables: invite players, each with their own PC and whispers | ours | – | ✓ |
| A35 | Plans and AI quotas (framework `entitlements`, `AIQuota`) | — | – | ✓ |
| A36 | Installable app; works on a phone | SillyTavern (web) | ✓ | ✓ |
| **Parity additions** |
| A37 | STscript: the full slash-command language (variables, conditionals, loops, closures, `/sendas`, `/gen`, `/inject`, …), run by a sandboxed interpreter | SillyTavern | ✓ | ✓ |
| A38 | Quick Replies sets bound to buttons, with auto-run triggers | SillyTavern | ✓ | ✓ |
| A39 | Extensions: built-ins that can be enabled or disabled, plus third-party extensions installed from a URL into a sandbox with declared permissions | SillyTavern | ✓ | ✓ |
| A40 | Extensions and assets browser (characters, backgrounds, themes, ambient audio) | SillyTavern | ✓ | ✓ |
| A41 | Data Bank: documents attached to a chat, a character or globally, retrieved by meaning (built-in RAG) | SillyTavern | ✓ | ✓ |
| A42 | Web search injected into context | SillyTavern (extension) | ✓ | ✓ |
| A43 | Chat translation: auto-translate input and output | SillyTavern (extension) | ✓ | ✓ |
| A44 | Image captioning and multimodal input (send an image; a vision model describes or reads it) | SillyTavern | ✓ | ✓ |
| A45 | Reasoning display: show or hide a model's thinking blocks; reasoning templates | SillyTavern | ✓ | ✓ |
| A46 | Function and tool calling for models that support it | SillyTavern | ✓ | ✓ |
| A47 | Text-completion and chat-completion modes; tokenizer choice; logit bias; CFG / negative prompts | SillyTavern | ✓ | ✓ |
| A48 | AI Horde as a backend | SillyTavern | ✓ | ✓ |
| A49 | UI customisation: themes, custom CSS, layout modes (bubble, document, VN), font scale, avatar style | SillyTavern | ✓ | ✓ |
| A50 | Multi-user accounts on one install, with per-user data and an admin | SillyTavern | ✓ | ✓ |
| A51 | Character tags, folders and favourites; welcome screen with recents | SillyTavern | ✓ | ✓ |
| A52 | Group greetings; `/sendas` a group member; group member muting and join modes | SillyTavern | ✓ | ✓ |
| A53 | Objectives and tasks for a character, tracked across a chat | SillyTavern (extension) | ✓ | ✓ |
| A54 | Animated avatars: Live2D and talking-head extensions | SillyTavern (extension) *(verify)* | ✓ | ✓ |
| A55 | Code blocks that run JavaScript or STscript (Code Runner), sandboxed | SillyTavern (extension) | ✓ | ✓ |
| A56 | Backups and chat exports (JSONL, text) | SillyTavern | ✓ | ✓ |

Third-party extensions (A39) and code runners (A37, A55) run third-party code. They run
only in a sandbox with declared permissions (an iframe or worker with a message API, and
server-side through the same sandbox as the VTT's scripts), never with the app's or the
server's own rights. The sandbox design is a security-review item before these ship.

## Out-of-character (OOC)

A table always has two conversations: the story, and the people around the table talking
about the story. SillyTavern has only the first, and players fake the second with `(( ))`,
which then pollutes the story context.

**Channels.** Every message carries a `channel`:

| Channel | Who sees it | Goes into the story context? |
|---|---|---|
| `ic` | the table | yes |
| `ooc` | the table | no; into the table-talk context |
| `gm` | the sender and the GM agent (a whisper to the GM) | no; into the table-talk context, private |
| `roll` | the table, or GM-only for a blind roll | its result, as a mechanical fact |
| `system` | the table | as the system message says |

`addressed_to` names `table`, `gm` or a character. A message from a human always has a
`channel`, and the composer sets it.

**The GM agent has two voices**, from one agent:

- **Narrator (`ic`):** the story voice, in the campaign's style.
- **Table GM (`ooc`/`gm`):** a plain, helpful voice that answers as the person running the
  game.

**What OOC can ask of the GM.** Each of these is an ability or a context change, not free
text:

- Rules questions, answered from the VTT's system pack and stats (`legal_actions`, sheet
  values), never invented.
- "What do we know?": a recap from the wiki as that player is allowed to see it.
- **Pace and tone:** "speed this up", "more combat", "less gore". These are written as
  **table notes**.
- **House rules:** written as table notes and kept in the GM's context for the whole
  campaign.
- **Retcon:** "that didn't happen". The GM proposes a branch point, and the table confirms
  with one click (A8).
- **Safety:**
  - Lines and veils are table notes of kind `line` or `veil`, enforced in every prompt.
  - The **X-card** is instant and needs no reason. It rewinds or skips the current beat,
    and the GM steers away without discussion.
  - **Pause** stops the GM taking turns until resumed.
- **Requests for secrets:** "what is the duke really up to?" The table GM declines anything
  the player's wiki access does not allow. The model never sees those secrets in a
  player-facing OOC context.

**Table notes** (`ai_table.TableNote`): `kind` (`house_rule`, `pacing`, `tone`, `line`,
`veil`, `reminder`), text, visibility (table, GM-only), and source message. The GM agent
reads them every turn. The players see them in a *Table* drawer and can edit them by
consensus (the GM proposes, and a player confirms).

**Detection.** The composer has an explicit IC/OOC switch, and `/ooc`, `((`, `//` switch it
for one message. An unmarked message is classified by the `message_intent` decision
(below). A low-confidence result asks the sender with a one-tap chip ("Was that in
character?") rather than guessing.

**UI.** OOC messages sit in a separate visual lane: indented, a muted surface, the sender's
real name rather than their character's, a smaller face. The story column can hide them
(*Story only*), and exports and session reports leave them out by default.

## Multiple models on multiple servers

A turn of an AI GM campaign is many small jobs, not one prompt:

- classify the message;
- recall memories;
- gate lorebook entries;
- decide every NPC's action;
- draft NPC lines;
- narrate;
- summarise;
- pick a sprite.

Run in series on one model, that is slow. Run in parallel on several servers sized for each
job, it is fast and cheap.

**Roles.** Each job belongs to a *model role*. A campaign maps each role to a pool:

| Role | Job | Typical size |
|---|---|---|
| `narrator` | the GM's story voice and the table GM | the largest model available |
| `npc` | major NPCs' lines and in-character choices | mid-size, one call per NPC, in parallel |
| `decision` | typed decisions (below) | small decision models |
| `summarizer` | rolling scene and session summaries, session reports | mid-size, off the critical path |
| `embedder` | memory recall, lore similarity | an embedding model |
| `tts`, `stt`, `image` | voices, dictation, art | as the framework's providers offer |

**Pools.** A pool is a set of provider instances (one per server, endpoint or gateway).
Each instance has its concurrency (how many requests it serves at once) and the roles it
may take.

- **Dispatch:** each request goes to the least-loaded healthy instance in the role's pool.
- **Failover:** a failure tries the next instance under the framework's retry and typed-error
  policy.
- **Fan-out:** independent jobs in a turn run concurrently across the pool.
- The servers can be the self-hosted tiers behind Bifrost, individual Ollama or llama.cpp
  hosts, or hosted APIs. Any mix works.

**A GM turn, scheduled:**

```
player message
 ├─ decision: message_intent                      ┐
 ├─ embedder: recall memories                     │ parallel
 ├─ decision: lore_relevance × candidate entries  │
 └─ (VTT) scene_snapshot, encounter_state         ┘
      │
      ├─ if OOC → narrator (table GM voice) → reply
      │
      ├─ decision: needs_roll → (VTT) roll → result
      ├─ per NPC in play, in parallel:
      │     decision: combat_action / target / morale (or npc: line)
      │     → (VTT) apply_action
      └─ narrator: streams the narration from the resolved facts
            └─ after reply, in the background:
                 summarizer: update rolling summary
                 decision: expression sprite per speaker
                 (wiki) append journal
```

Each turn has a deadline and a budget. A job past its deadline is cancelled. A missing
decision falls back (below), and a missing NPC line is folded into the narration. The
latency targets are set in `contract/` once measured on the real servers. None is promised
here.

**What the framework gives and what it lacks.**

- **It gives:**
  - provider instances and providers (`ai`, including `PRV_Bifrost`, the OpenAI-compatible
    family and `local_ai_gguf`);
  - rotations;
  - agents with pinned instances (`ai_agents`, "Thinking");
  - quotas.
- **It lacks parallel dispatch.** A framework *rotation* is ordered failover: it "will try
  each instance in order until one succeeds" (`RotationModel`). Load-aware concurrent
  dispatch across instances is a generic capability. It belongs in the framework's provider
  layer as a pool mode beside rotation, raised on card 253, and this product uses it rather
  than building its own.

**Where the self-hosted servers are.** The self-hosted model servers and their tiers are
the Self Hosted AI session's area (AI Lab card 182, SOP *AI Environment*). Which servers
serve which roles, and where the decision models run, is decided there with the operator.
The app only takes provider instances as configuration.

## Decision models (Jev-style)

Per the SOP, a decision model emits a **typed decision**: a choice from a fixed set, a
calibrated score or an explicit **null**, in one forward pass. It is a System-1 layer in
front of the LLM, judged on calibration and on abstaining correctly. The LLM is the
System-2 fallback for every null.

**The decision kinds this product uses:**

| Kind | Options | Used for |
|---|---|---|
| `message_intent` | `ic_speech`, `ic_action`, `ooc`, `command`, `gm_whisper` | routing a message (OOC detection) |
| `needs_roll` | `none` or a stat/skill from the system pack | whether an action calls for a check |
| `combat_action` | the VTT's `legal_actions(combatant)` | what an NPC does on its turn |
| `target_select` | the legal targets | whom it does it to |
| `morale` | `fight`, `fall_back`, `flee`, `surrender`, `parley` | when NPCs break |
| `disposition_shift` | −2 … +2 | how an NPC's attitude moves after an exchange |
| `next_speaker` | the characters present | group-chat and scene turn-taking |
| `lore_relevance` | score per candidate entry | gating lorebook inclusion beyond keywords |
| `expression` | the character's sprite set | the portrait to show |

**The contract of a decision call:**

- **Input:** the kind, the enumerated options (always supplied by the caller; for combat, by
  the VTT's rules) and a compact state summary (the combatant's sheet, positions, cover,
  recent events, disposition).
- **Output:** `{ choice | null, confidence, model, latency_ms }`.
- **The rule:** the model can only choose from the options. It can never invent an action
  the rules do not allow.

**Fallback.** Below the kind's calibrated threshold, or on null, the same options go to the
`npc` or `narrator` role with a constrained (JSON-schema) answer. The outcome is still one of
the options.

**Records.** Every decision is a `DecisionRecord`:

- the kind, the options and the chosen value;
- confidence, model, latency, whether it fell back, and the final choice;
- the turn and session.

The records feed the calibration review, are where the *why* panel reads from, and are what
a threshold is tuned against.

**The why panel.** On any NPC action in the transcript, *Why?* opens:

- the options it had;
- what the decision model chose and how sure it was;
- whether the LLM took over;
- the VTT roll that followed.

The GM (human or AI) can override, and the override is recorded.

**Roster and runtime.** The candidates are the SOP's roster: Laya (typed-decision head),
Kev, the Decider family (a 35B-A3B MoE for many-option decisions) and OpenJev as the
quality reference. They are GGUF only by the SOP's format policy, and sized for small
cards. Which models are enrolled and where they run are the Self Hosted AI area's to
decide (above). The app reaches them through a provider instance that offers a
**`decide`** capability.

**Framework gap:** the `ai` extension offers chat, embeddings, images, transcription and
speech, not a typed-decision call. A `decide` ability (enumerated options in, choice or null
plus confidence out) is generic, so it is raised on card 253 for the framework. The
product's decision kinds and thresholds are its own.

## The GM agent

The GM is a framework agent (`ai_agents`):

- **Seat:** it sits in the play conversation (`ConversationAgent`, `auto_respond`).
- **Thinking:** on the `narrator` pool.
- **Tools:** it is granted abilities as tools:
  - the wiki's reads and journal writes;
  - the VTT's `roll`, `legal_actions`, `apply_action`, `move_token`, `cover`,
    `encounter_state`, `scene_snapshot`;
  - this product's `decide`, `table_note`, `branch_proposal`.

Every tool call runs as the agent's owner with the owner's ACL (framework rule), so it can
never read a secret its owner could not.

**Major NPCs** are agents too, each with its own memory (`ai_memories`) and a wiki-limited
knowledge scope: the NPC knows what the wiki says it knows. **Minor NPCs** are voiced by the
GM.

**Context assembly (the prompt manager).** Sections in order, each with a token budget and a
toggle:

1. the system and style;
2. table notes (house rules, lines and veils);
3. the character cards present;
4. the scene: the location entity, who is present, and what is perceivable from
   `scene_snapshot`;
5. mechanical state: the sheets and the encounter, as a structured block;
6. lore: gated lorebook entries;
7. memory: rolling summary and recalled memories;
8. recent transcript (`ic` only);
9. author's note;
10. the turn's resolved facts (rolls, decisions).

The context inspector (A18) shows exactly this per turn.

## Screens

| Path | What it is |
|---|---|
| `/` | Landing: hero with a live sample scene, the OOC lane and the why panel visible; SillyTavern comparison; pricing; FAQ. |
| `/play` | Library: your chats and campaigns, newest first, with portraits and last line. |
| `/play/[conversation]` | **The play surface** (below). |
| `/characters`, `/characters/[id]` | Card gallery; card editor with every V2/V3 field, greetings, examples, sprites, voice, and "link to a wiki person". |
| `/personas` | Your personas. |
| `/lorebooks`, `/lorebooks/[id]` | Lorebook list and entry editor (the full field surface), with "generate from the world". |
| `/campaigns/[id]/gm` | The GM: style, difficulty, content rating, table notes, model roles for this campaign, decision thresholds. |
| `/models` | Providers, pools, instances, role mapping, live status (A28). |
| `/presets` | Sampler presets, instruct and context templates. |
| `/settings` | Theme, text size, reduced motion, contrast, TTS voice, keybindings, OOC display. |

### The play surface

- **Centre:** the conversation column.
  - Messages carry portraits and expression sprites, speaker names and a world date and
    time from the wiki calendar.
  - Swipe arrows and branch markers.
  - The OOC lane, set visually apart.
  - Roll cards inline, with dice, formula and the "why" of modifiers.
  - *Why?* on NPC actions.
- **Composer:**
  - the IC/OOC switch;
  - a *Say*/*Do* switch for IC;
  - a roll button with the sheet's stats;
  - impersonate, continue, regenerate;
  - an X-card button, always visible and never more than one tap.
- **Left drawer, World:** the current location's entity card, the NPCs present, active
  quests, and lore cards for anything mentioned. A hover on any `@` name shows its wiki
  preview card.
- **Right drawer, Table:**
  - a live mini-map of the VTT scene (read-only here; *Open table* goes to the VTT);
  - the combat HUD (initiative, turn, HP bars);
  - your sheet;
  - table notes.
- **Top bar:** the campaign, the scene, the players present, the GM state (thinking,
  waiting, paused), and a small model-status dot that opens the role and server breakdown.
- **On a phone:** the drawers become bottom sheets, and the composer stays pinned.

## Visual design

Conversation first. A calm reading column with comfortable line length, and character
presence through portraits and sprites rather than chrome. Story and table talk are
visually distinct at a glance: story is set in the body face on the main surface, OOC in
the UI face on a muted inset. Dark by default (long evening sessions), light first-class.
Typing and streaming indicators are gentle, respect reduced motion, and never flash. The
GM's "thinking" state names what it is waiting on ("rolling for the ogre…") rather than
spinning.

## Data and contract

The server extensions this product owns:

- **`ai_character`** (OBJECT_PLAN): `CharacterCardModel`, `PersonaModel`,
  `ExpressionSpriteModel`, `GenerationPresetModel`. Add `voice` and the wiki link.
- **`ai_lorebook`** (OBJECT_PLAN): `LorebookModel`, `LorebookEntryModel`.
- **`ai_table`** [NEW]:
  - `PlaySessionModel`: campaign, conversation, mode, GM agent, optional VTT scene and
    encounter.
  - `TableNoteModel`: as under OOC above.
  - An `@extension_model` on the framework's conversation `MessageModel` adding `channel`,
    `addressed_to`, `speaker_character_id`, `swipe_group` and `swipe_index`.
- **`ai_gm`** [NEW]:
  - `GMProfileModel`: style, tone, difficulty, verbosity, narrative person, content rating.
  - `ModelRoleAssignmentModel`: campaign, role, pool, preset.
- **`ai_decision`** [NEW]:
  - `DecisionPolicyModel`: kind, pool, threshold, fallback role.
  - `DecisionRecordModel`: as above.
- **Adapters:** SillyTavern card PNG/JSON (V2/V3), lorebook JSON, chat JSONL; import and
  export.

**Framework reuse:** `ai`, `ai_agents`, `ai_chains` (quick-reply macros), `ai_prompts`
(templates), `ai_memories`, `conversations`, `media`, `entitlements`.

**Framework gaps raised on card 253**, all generic:

1. a pool dispatch mode;
2. a `decide` provider capability;
3. multi-user room sync with per-recipient filtering (shared with the VTT).

Until (3) lands, single-player play streams over the framework's ordinary SSE.

## Editions

- **Lite:**
  - one person, every single-player mode, SQLite;
  - models are whatever endpoints the user configures (their own Ollama, llama.cpp, Bifrost
    or API keys), and several endpoints still form pools;
  - the wiki and VTT features appear when their extensions are loaded.
- **SaaS:**
  - accounts and multi-player tables;
  - hosted model pools with quotas;
  - the hosted decision layer, cloud media, plans.

## Phases

Each phase ends with polished, finished UI for what it covers, not a scaffold.

1. **Foundation:**
   - the repo carved out (card 256);
   - the UI shell, brand, landing;
   - character cards, personas, single-character chat with streaming, swipes, branches,
     edit;
   - presets, prompt manager, context inspector;
   - SillyTavern import.
2. **Lore and memory:** lorebooks (full surface), rolling summaries, `ai_memories` recall;
   wiki-linked characters and generated lorebooks (with the wiki extensions loaded).
3. **AI GM and OOC:** the GM agent, channels, the OOC lane, table notes, safety tools,
   recaps from the wiki, session reports written back.
4. **Many models:**
   - roles, pools, the models page;
   - the per-turn parallel scheduler on the framework's pool mode;
   - NPC agents.
5. **Decisions and combat:**
   - the VTT's phase-1 mechanics as tools;
   - the decision kinds with records and the why panel;
   - calibration review;
   - group-chat turn-taking.
6. **Table:** multi-player (after room sync), the AI party mode, sprites and VN mode, TTS
   and STT, image generation.
7. **The remaining SillyTavern parity:**
   - STscript and Quick Replies;
   - the extension sandbox and the assets browser;
   - the Data Bank, web search, translation, captioning;
   - reasoning display, tool calling, completion modes, Horde;
   - themes and layout modes, multi-user installs, objectives, animated avatars, the code
     runner (A37–A56).

## Decisions for the operator

These are architecture and placement, so they are asked, never defaulted. They are routed
through the Session 0 Manager:

1. The framework additions above (pool dispatch, `decide`, room sync) go in server-framework
   as generic capabilities.
2. Which servers serve which roles, and where the decision models are enrolled (Self Hosted
   AI, card 182).
3. Lite scope: whether lite includes the GM campaign mode with the VTT and wiki in one local
   install, or stays chat-and-lore only.
