# SillyTavern feature audit (2026-11-21)

The operator asked for a full feature audit against SillyTavern before the initial release
(2026-11-21). This page is that audit for rpg-ai. It was made from SillyTavern's own source and
documentation, not from memory or the old matrix:

- **SillyTavern** 1.19.1, `release` at 82b64a4 (2026-11-19): the slash commands below are read
  from its source (every `SlashCommand.fromProps` registration, aliases included), and the
  built-in extensions from `public/scripts/extensions/`.
- **SillyTavern-Docs** at 2148f90 (2026-11-15): every settings panel, feature and extension page.

Every "covered" was checked against rpg-ai's code at 890d379 plus the uncommitted AP8 work, and
names the file or route that does it.

**Statuses:**
- **covered:** built in both editions unless noted;
- **partial:** built, with exactly what is missing named;
- **missing:** not built, and in scope (the operator's target is full parity);
- **not planned:** deliberately left out, with the reason;
- **out of scope:** a SillyTavern UI or install mechanism with no counterpart in rpg-ai.

## Summary

| Area | Items | Covered | Partial | Missing | Not planned or out of scope |
|---|---|---|---|---|---|
| Characters, personas, cards | 22 | 10 | 4 | 8 | 0 |
| Chat and messages | 31 | 14 | 4 | 13 | 0 |
| Group chats | 12 | 4 | 1 | 7 | 0 |
| World Info | 30 | 15 | 2 | 13 | 0 |
| Prompts, templates and macros | 22 | 9 | 4 | 9 | 0 |
| Samplers and generation | 26 | 6 | 1 | 19 | 0 |
| APIs and backends | 20 | 8 | 4 | 7 | 1 |
| Extensions | 29 | 6 | 10 | 9 | 4 |
| UI customisation and settings | 22 | 8 | 3 | 10 | 1 |
| Accounts, server and import and export | 16 | 9 | 2 | 3 | 2 |
| **Features, total** | **230** | **89** | **35** | **98** | **8** |
| Slash commands (all of them) | 293 | 46 | 26 | 194 | 27 |

Of the 230 features, 89 are covered and 35 partly built. Most of what's missing is SillyTavern's
long tail: samplers, macros, the prompt manager's free-form prompts, and STscript's command
library. The core loop (cards, chat, swipes, branches, World Info, presets, groups, recall,
regex, quick replies) is covered.

## Release-blocking gaps, ranked

Ranked by how often a SillyTavern user meets the gap in an ordinary session, and how badly an
imported card, preset or script breaks without it.

1. **Macros beyond `{{char}}` and `{{user}}`.** Imported cards, lorebooks, presets and quick
   replies use `{{random}}`, `{{roll}}`, `{{time}}`, `{{date}}`, `{{idle_duration}}`,
   `{{lastMessage}}`, `{{getvar}}`/`{{setvar}}`, `{{// comment}}`, `{{trim}}`, `{{newline}}` and
   the rest. Today they reach the model as literal text (`features/prompt/macros.ts` expands only
   the two names). It's the most visible break on import.
2. **Samplers.** Presets carry temperature, top-p, top-k and repetition penalty only
   (`contract/rpg_ai.json` `sampler_ranges`). Min-P, presence and frequency penalty, seed and
   typical-P are in nearly every SillyTavern preset and in every OpenAI-compatible server. DRY,
   XTC, Mirostat, dynamic temperature, smoothing, top-A, TFS, epsilon and eta, repetition-penalty
   range, and top-nsigma are text-completion backends' everyday tools. An imported preset loses
   them silently.
3. **Prompt manager free-form prompts.** rpg-ai orders, toggles and budgets its fixed sections
   (A16). SillyTavern presets add their own named prompts, each with a role, a position (relative
   or in-chat at a depth) and an order, and carry a main prompt, jailbreak, NSFW and enhance-
   definitions prompts. An imported chat-completion preset can't be expressed. Also missing:
   start-reply-with (prefill), and continue prefill or nudge.
4. **Context templates (story string) and instruct-template details.** Text-completion users pick
   a context template (story string, example separator, chat start) alongside the instruct one.
   rpg-ai's instruct templates (A17) have no story string, no "include names", and no
   activation regex. Imported instruct and context JSON can't be read in.
5. **STscript's generation and chat commands.** `/gen`, `/genraw`, `/trigger`, `/send`,
   `/inject`, `/messages`, `/swipe`/`/addswipe`, `/hide`/`/unhide`, `/del`, `/cut` and `/sysgen`
   are what popular quick-reply sets call. 185 of the 293 commands are missing (table below).
   The 55 covered are the language core (variables, maths, control flow, strings, input) and,
   since gap 5's work, `/gen`, `/genraw`, `/sysgen`, `/send`, `/trigger`, `/messages`,
   `/addswipe`, `/del` and `/comment`; `/inject` and `/cut` are next.
6. **Group chat generation modes.** There's no swap-versus-join character cards, no auto-mode,
   no "allow self responses", no pooled order, no per-group scenario override and no group nudge
   template. Groups work, but SillyTavern group players set these first.
7. **Character's Note (depth prompt) and talkativeness.** V2 cards carry
   `extensions.depth_prompt` (text, depth, role) and `extensions.talkativeness`. rpg-ai imports
   and keeps them but never uses them, so a card that relies on a depth prompt plays differently.
8. **Native APIs.** Only OpenAI-compatible chat and text, AI Horde and in-browser WebLLM are
   spoken. Claude (Anthropic's own API), Google AI Studio and Vertex, NovelAI, Cohere's and
   AI21's own APIs, and KoboldCpp's and Ooba's native generate APIs (which carry the
   text-completion samplers) need a proxy. Claude and Gemini users are a large share. Connection
   profiles (saved API, model, preset and template sets, switched in one tap) are missing.
9. **Personas: locking and position.** A persona can be locked to a chat (chosen per chat) or be
   the default. There's no lock to a character, no description position (in-prompt, at depth,
   top or bottom of the author's note), no persona lorebook, no title, and no "convert a
   character to a persona".
10. **Hide messages from the prompt.** SillyTavern's eye toggle hides any message from the prompt
    and keeps it on screen (`/hide`). rpg-ai has only the X-card, which marks a reply as carded
    for safety, not for context control.

Close behind are image-generation sources (A1111, ComfyUI, NovelAI, Pollinations), TTS and STT
providers beyond OpenAI-compatible, caption models for text-only chats, data-bank recall by
meaning in lite, and World Info vector matching.

## Characters, personas, cards

| Item (ST docs page) | Status | Where, or what's missing |
|---|---|---|
| Description, personality, scenario, first message, examples (characterdesign) | covered | `components/characters/CharacterForm.tsx`, `features/prompt/assemble.ts` |
| Alternate greetings | covered | `CharacterForm.tsx` (How they open); swiped at chat start |
| Prompt overrides: main prompt and post-history instructions | covered | card `system_prompt`, `post_history_instructions` in `assemble.ts` |
| Creator's metadata: notes, creator, version, tags | covered | `CharacterForm.tsx` (About the card) |
| Character's Note (depth prompt: text, depth, role) | missing | kept in `extensions.depth_prompt` on import but never put in the prompt |
| Talkativeness (group reply chance) | missing | not read; groups use turn order (A10) |
| Personality summary as its own prompt field | covered | `{{char}}'s personality:` section in `assemble.ts` |
| Favourite, tags, tags as folders, search and sort (tags) | covered | `CharacterGallery.tsx`, `FolderChips.tsx` (A51) |
| Filter by tag; tag import on card import | partial | filter chips by folder and tag; tags taken from the card; no tag colours or tag management screen |
| Character list sort orders (name, date, recent, tokens, random) | partial | search, favourites first, folders; no sort choice |
| Card import V1, V2 and V3, JSON and PNG, several at once | covered | `features/import/characterCard.ts`, `pngCard.ts`, `stCard.ts` |
| Card export PNG (lorebook embedded) and JSON | covered | `features/import/exportCard.ts` |
| Import from URL (Chub, JanitorAI, Pygmalion, RisuRealm) | missing | file import only |
| Duplicate a character | missing | no duplicate action |
| Convert a character to a persona, or a persona to a character | missing | |
| Personas: name, description, avatar, default persona, per chat | covered | `PersonaManager.tsx`, chat `persona_id` (A3) |
| Persona locked to a character | missing | |
| Persona description position (prompt, at depth, author's note top or bottom) | missing | always in the persona section |
| Persona lorebook | missing | chats and characters have lorebooks; personas don't |
| Persona title | partial | name and description only |
| Expression sprites, per-character labels, upload | covered | `ExpressionEditor.tsx`, `/v1/character_expression` (A4) |
| Expression ZIP import; several images per expression; sprite-folder override | partial | single image per label; no ZIP import or folder override |

## Chat and messages

| Item | Status | Where, or what's missing |
|---|---|---|
| Streaming, stop, continue, regenerate, impersonate | covered | `features/chat/useReply.ts`, `replyStream.ts`, `lib/generate.ts` (A6) |
| Swipes, kept and browsable | covered | `MessageItem.tsx` (A7) |
| Branches from any message, a tree of every branch | covered | `BranchTree.tsx`, `features/chat/branch.ts` (A8) |
| Checkpoints (named branch points, go back to the parent) | partial | branches cover forking; no named checkpoints or "back to parent chat" |
| Edit, delete, move up or down | covered | `MessageItem.tsx`, `/v1/ai_chat/move` (A9) |
| Bookmarks | covered | `ChatMessage.bookmarked` |
| Edit a message's text | covered | `MessageItem.tsx` |
| Copy a message | missing | |
| Hide a message from the prompt (eye toggle) | missing | only the X-card (safety), not context control |
| Delete several messages at once (delete mode) | missing | one at a time |
| Edit the speaker's name or role of a message | missing | |
| Rename a chat; chat library with folders, tags and search | covered | `ChatLibrary.tsx`, `features/chat/library.ts` (A12) |
| Import SillyTavern chats (JSONL) | covered | `features/import/stChat.ts` (A13) |
| Export JSONL and text | covered | `ChatView.tsx` export menu (A56); EPUB is ours (AP10) |
| Temporary chat (not saved) | missing | |
| Welcome screen with recent chats | partial | the chat library lists every chat; no welcome screen of recents |
| Welcome-page assistant (a default assistant chat) | missing | |
| Auto-swipe (swipe again on a short or blacklisted reply) | missing | |
| Auto-continue (continue a reply that stopped short) | missing | |
| Token probabilities panel; reroll a token | missing | no logprobs |
| Message timestamps, IDs, token counts, generation time | partial | the reply's tokens and time while open (AP5); no timestamps or IDs on screen |
| Markdown rendering; quote and action styling | covered | `features/chat/roleplayText.ts` |
| Reasoning display: fold, edit, parse from tags | covered | `splitReasoning` in `assemble.ts`, `MessageItem.tsx` (A45) |
| Reasoning templates; add reasoning by hand; continue from reasoning | partial | `<think>` and streamed `reasoning_content` only |
| Send images; vision models read them | covered | `ChatMessage.images` (A44) |
| Attach files to a message (data bank) | missing | documents attach to chats and characters (A41), not to a message |
| Chat hotkeys (Up to edit last, Ctrl+Enter regenerate, …) | missing | Enter sends |
| Markdown hotkeys (bold and italic) | missing | |
| Swipe gestures on phones | missing | swipe arrows only |
| Out-of-character channel, table notes, the AI GM | covered | ours (A11, A20) |
| Rolling summary shown at the top ("Previously…") | covered | `Recap.tsx` (AP2) |

## Group chats

| Item | Status | Where, or what's missing |
|---|---|---|
| Manual, list and natural order | covered | `features/chat/turns.ts`, `NextSpeaker.tsx` (A10) |
| Pooled order | covered | `features/chat/turns.ts` `pooledSpeaker`, chat `group_settings.order` (gap 6) |
| Mute a member; force a member to talk | covered | chat `muted_ids`, pick who speaks next (A52) |
| Group greetings in turn | covered | A52 |
| Swap character cards vs join character cards (join prefix and suffix) | covered | `group_settings.card_mode`, `assemble.ts` / `Prompt.py` member cards (gap 6) |
| Auto-mode (members keep talking on a timer) | covered | `group_settings.auto_seconds`, `components/play/useAutoReply.ts` (gap 6) |
| Allow self responses | covered | `group_settings.allow_self`, `turns.ts` (gap 6) |
| Group scenario override | covered | `group_settings.scenario` (gap 6) |
| Peek a member's definitions | partial | open the character's page; no in-chat peek |
| Group nudge prompt template | left out | made Cydonia 24B worse in the live A/B (2026-11-21); group stop strings instead (`features/chat/group.ts`) |
| Member management in the chat (add, remove, reorder) | covered | `ChatSettings.tsx` |
| Group avatar (collage or custom) | missing | |

## World Info

| Item | Status | Where, or what's missing |
|---|---|---|
| Global, character and chat lorebooks | covered | `lorebook_ids` on chats, `lorebookId` on characters (A14) |
| Persona lorebook | missing | |
| Insertion strategy (sorted evenly, character first, global first) | missing | one pool by order |
| Keys, secondary keys, AND ANY / AND ALL / NOT ANY / NOT ALL | covered | `features/lore/activate.ts` |
| Regex keys | covered | `/pattern/flags` keys in `activate.ts` |
| Content, title (memo), enabled, constant | covered | `components/lore/EntryForm.tsx` |
| Insertion order and positions (before and after char, examples, AN, at depth with role) | covered | `contract.lore.positions` |
| Outlets (`{{outlet::name}}`) | missing | |
| Probability | covered | `activate.ts` |
| Inclusion groups, prioritise, group weight | covered | `activate.ts` |
| Group scoring | missing | |
| Automation ID | missing | |
| Character filter (names, exclude) | covered | `character_names`, `character_exclude` |
| Character tag filter | missing | names only |
| Triggers (generation types an entry fires on) | missing | |
| Additional matching sources (persona and character descriptions, scenario, note) | missing | scans the chat only |
| Vector storage matching | missing | keyword and regex only |
| Sticky, cooldown, delay | covered | `activate.ts` timed effects, `ChatLoreState` |
| Exclude, prevent and delay-until recursion | covered | `activate.ts` |
| Scan depth, budget, recursion steps | covered | chat `lore_settings` |
| Case-sensitive and whole-word, per entry or global | covered | `activate.ts` |
| Include names in the scan | missing | |
| Min activations; max depth | missing | |
| Budget as a percent of context | partial | a token budget only |
| Alert on overflow | missing | |
| Import and export SillyTavern lorebooks; character book in cards | covered | `features/import/stLorebook.ts`, `importBook.ts` |
| Entry list search, sort, bulk enable | partial | list and edit; no bulk actions |
| Wiki-generated lorebooks, the relevance gate | covered | ours (A15) |
| Names without lore | covered | ours (AP9) |
| `/world`, `/findentry` and the rest of the WI commands | missing | see the command table |

## Prompts, templates and macros

| Item | Status | Where, or what's missing |
|---|---|---|
| Main (system) prompt; a chat's own system prompt | covered | `assemble.ts`, chat `system_prompt` (A16) |
| Post-history instructions | covered | `assemble.ts` |
| Author's note: text, depth, chat-specific | covered | chat `author_note`, `author_note_depth` (A16) |
| Author's note frequency, position (after scenario), role, default note | partial | in-chat at a fixed depth only |
| Prompt manager: order, enable, token budget per section | covered | `PromptLayoutEditor.tsx` |
| Prompt manager: own prompts with role, position, depth, triggers | missing | fixed sections only |
| Utility prompts: impersonation, continue nudge, new-chat and group-nudge, empty-message replacement | partial | impersonate prompt only (`contract.prompt.impersonate_prompt`) |
| Character names behaviour; wrap in quotes; squash system messages | missing | |
| Start reply with (prefill) | missing | |
| Custom stop strings | covered | preset `stop` |
| Instruct templates; a person's own | covered | `features/prompt/instruct.ts`, `InstructTemplateManager.tsx` (A17) |
| Instruct: include names, activation regex, wrap in newline, system sequence prefix and suffix variants | partial | sequences only |
| Context templates (story string, example separator, chat start) | missing | |
| Import and export instruct and context templates (ST JSON) | missing | |
| System prompt presets (`/sysprompt`) | missing | one system prompt per chat or card |
| Macros `{{char}}`, `{{user}}`, `<BOT>`, `<USER>` | covered | `features/prompt/macros.ts` |
| The rest of the macros (random, roll, pick, time, date, idle_duration, lastMessage, getvar/setvar, trim, comments, newline, …) | missing | release gap 1 |
| Scoped and conditional macros, variable shorthands (`{{.var}}`) | missing | |
| Context inspector: what was sent, by section | covered | `ContextInspector.tsx` (A18) |
| Token counter; tokenizer choice | partial | estimate, or the server's `/tokenize` (A47); no tokenizer choice list |
| Token padding | missing | |
| CFG / negative prompt, guidance scale | covered | preset `negative_prompt`, `guidance_scale` (A47) |

## Samplers and generation

| Item | Status | Where, or what's missing |
|---|---|---|
| Response length, context length | covered | preset `max_tokens`, `context_tokens` |
| Temperature, top-P, top-K | covered | `contract.sampler_ranges` |
| Repetition penalty | covered | `contract.sampler_ranges` |
| Repetition penalty range and slope | missing | |
| Presence and frequency penalty | missing | |
| Min-P | missing | |
| Typical-P | missing | |
| Top-A | missing | |
| Tail-free sampling | missing | |
| Smoothing factor and curve | missing | |
| Dynamic temperature | missing | |
| Epsilon and eta cutoff | missing | |
| DRY | missing | |
| XTC | missing | |
| Mirostat | missing | |
| Beam search | missing | |
| Top-nsigma | missing | |
| Seed | missing | |
| Logit bias | covered | preset `logit_bias` (A47) |
| Banned tokens and strings | missing | |
| Sampler order | missing | |
| Streaming on or off | covered | always streamed; Horde as a job |
| Multiple swipes per generation (n) | missing | |
| Presets per model; import SillyTavern presets | partial | presets per chat (`PresetManager.tsx`); no ST preset import |
| Chat completion vs text completion | covered | endpoint `api` chat or text (A47) |
| Request model reasoning, reasoning effort | missing | |

## APIs and backends

| Item | Status | Where, or what's missing |
|---|---|---|
| Any OpenAI-compatible chat API (OpenAI, OpenRouter, DeepSeek, Mistral, Groq, Perplexity, LM Studio, …) | covered | `lib/generate.ts` `completions_url`, `EndpointManager.tsx` |
| Any OpenAI-compatible text-completion API (llama.cpp, KoboldCpp, Ooba, TabbyAPI, vLLM, Aphrodite) | covered | endpoint `api: text` |
| Ollama | covered | through its OpenAI-compatible API |
| AI Horde | covered | `api: horde` (A48) |
| In-browser models (WebLLM) | covered | `features/models/inBrowser.ts` (AP6) |
| Claude through Anthropic's own API | missing | OpenAI-compatible only (through a proxy or OpenRouter) |
| Google AI Studio and Vertex | missing | |
| NovelAI | missing | |
| Cohere, AI21, Mancer, DreamGen, Pollinations, Electron Hub, AI/ML API native APIs | missing | OpenAI-compatible ones work |
| KoboldCpp, Ooba and Tabby native endpoints (full sampler set) | partial | used through their OpenAI-compatible API, so their own samplers aren't sent |
| KoboldAI Classic | out of scope | abandoned upstream |
| Several endpoints, each with roles | covered | ours (A27) |
| Model list from the server; connection check | covered | `ModelStatus.tsx`, `/v1/ai_chat/ping` (A28) |
| API keys kept per endpoint, encrypted at rest (SaaS) | covered | `ModelEndpoint.apiKey`, `encrypt_secret` |
| Connection profiles (API, model, preset, templates as one switch) | missing | |
| Reverse proxy presets | missing | the endpoint's base URL serves |
| Prompt post-processing (merge, strict, semi-strict) | missing | |
| Function and tool calling | partial | the twin and the per-chat switches (A46); running calls inside a reply comes after A19 and AP8 |
| Web search in the request (provider-side) | partial | rpg-ai's own search (A42), not the provider's |
| Inline images and video to the model | partial | images (A44); no video |

## Extensions

| Built-in or official extension | Status | Where, or what's missing |
|---|---|---|
| Summarize | partial | rolling summary on request, edited and kept (A19); no auto-summary every N messages, no summary prompt or position settings |
| Vector storage: chat messages | covered | recall by meaning (A19), across chats per character (AP8) |
| Vector storage: data bank files | partial | lite finds by words; by meaning still to come |
| Vector storage: World Info entries | missing | |
| Data Bank: notepad, file, web, YouTube, Fandom, web-search sources | partial | text documents for everyone, a chat or a character (A41); no web, YouTube or Fandom scrapers, no file parsing beyond text |
| Character Expressions with a classifier | covered | the model picks a label from the character's own (A4, `/v1/ai_chat/expression`) |
| Local and Extras classifiers | not planned | a decision model replaces them (the operator's design) |
| Quick Replies: sets, buttons, auto-run, ST import | covered | `QuickReplyManager.tsx`, `features/import/stScripts.ts` (A32, A38) |
| Quick Replies: context menu, linked sets, the `/qr-*` commands | missing | |
| Regex: scripts, placement, depth, ephemerality, flags, ST import | covered | `RegexManager.tsx`, `features/chat/regex.ts` (A33) |
| Regex presets and per-character scoped scripts | missing | |
| Translation | partial | by a model, per message, and replies into the device's language (A43); no Google, DeepL, Libre, Lingva or Yandex providers, and the person's own lines aren't translated before sending |
| TTS | partial | OpenAI-compatible `/audio/speech` and the browser, a voice per character (A29); no ElevenLabs, Azure, Coqui, AllTalk, XTTS or other providers, no narrate-quotes-only options |
| Speech recognition | partial | the browser's dictation; no Whisper or other API |
| Image generation | partial | OpenAI-compatible `/images/generations`, portraits, backgrounds and scenes (A30); no A1111, ComfyUI workflows, NovelAI, Pollinations or Stability, no styles or negative prompt |
| Image captioning | partial | vision models read images (A44); no caption for text-only models |
| Web search | partial | SearXNG and Brave (A42); no SerpApi, Tavily, Serper or Z.AI, no page scraping |
| Objective (tasks) | partial | objectives listed, the first not done in the prompt (A53); no task generation by the model, no auto-check every N messages |
| Token counter | covered | context inspector (A18) |
| Gallery (character images) | missing | |
| Assets browser | missing | A40 |
| Connection manager (profiles) | missing | see APIs |
| Talking head | covered | `TalkingSprite.tsx` (A54) |
| Live2D, VRM | missing | A54: an optional add-on after the operator's licence review |
| Dynamic Audio (BGM, ambience) | missing | |
| Blip (text sounds) | missing | |
| RVC voice conversion | not planned | needs a local Python server; not planned for release |
| EmulatorJS | out of scope | a game emulator, unrelated to roleplay |
| Third-party extensions (install from URL) | not planned | A39: extensions are the framework's, installed by the install |

## UI customisation and settings

| Item | Status | Where, or what's missing |
|---|---|---|
| Themes (built-in) | covered | the framework's themes, `ThemePicker.tsx` (A49) |
| Theme colours by hand; import and export themes | missing | |
| Custom CSS | covered | `CustomCss.tsx` |
| Chat style (flat, bubbles, document) | covered | `deviceSettings.ts` (A49) |
| Font scale | covered | `textSize` |
| Avatar style (round, square, rectangular) | missing | |
| Message width; blur and shadow strength | missing | |
| Visual novel mode | partial | the sprite stage (A4); no VN layout with the chat as a text box |
| Waifu mode, MovingUI, panel layout | out of scope | ST's own panel UI |
| Backgrounds: per chat, library, upload | covered | chat `background`, Draw a background (A31) |
| Notifications and message sound | missing | |
| LaTeX and formula rendering | missing | |
| Show timestamps, model icons, message IDs, token counts | missing | |
| UI language (i18n) | missing | English only |
| Settings search | missing | |
| Auto-load last chat; auto-scroll and send behaviour | partial | the chat opens where left; no settings for these |
| Clean-up menu (orphaned files, thumbnails, backups) | missing | |
| Hotkeys | missing | see Chat |
| Mobile layout | covered | every screen (A36) |
| Installable app | covered | `app/manifest.ts` (A36) |
| Debug menu and prompt inspection | covered | context inspector (A18) |
| Welcome screen | partial | see Chat |

## Accounts, server and import and export

| Item | Status | Where, or what's missing |
|---|---|---|
| Multi-user accounts, roles, admin | partial | SaaS through the framework's auth; lite has no local accounts yet (A50) |
| Login screen, password recovery | covered | SaaS: auth_session and auth_magic_link |
| SSO | covered | SaaS: the framework's auth extensions |
| Per-user data | covered | every record is owner-scoped |
| Content scaffolding for new users | missing | |
| config.yaml settings (listen, whitelist, basic auth) | out of scope | install concerns of the framework |
| Remote connections, tunnelling, reverse proxying | out of scope | deployment |
| Backups of everything, restored beside what's there | covered | `features/backup/backup.ts` (A56) |
| Settings backups and restore | partial | data backed up; device settings aren't in the backup |
| Import cards, chats, lorebooks, QR sets, regex | covered | `features/import/*` |
| Import presets, instruct and context templates, themes | missing | |
| Export cards, chats, lorebooks | covered | `exportCard.ts`, the chat export menu, `stLorebook.ts` |
| Export presets and templates | missing | |
| Server plugins | covered | framework extensions (A39) |
| Chat backups kept automatically | covered | every write is kept; branches never overwrite |
| Secrets management UI | covered | keys per endpoint in Models |

## Slash commands

Every command SillyTavern 1.19.1 registers, from its source. Covered commands run in rpg-ai's
STscript interpreter (`features/chat/stscript.ts`, with the chat actions in
`components/play/ChatView.tsx` `SCRIPT_ACTIONS`) or as chat commands (`features/chat/commands.ts`).
rpg-ai's own commands (`/ic`, `/ooc`, `/gm`, `/narrate`, `/xcard`, `/pause`, `/resume`, `/search`,
`/help`) aren't in SillyTavern and aren't counted.

| Command | Aliases | ST source | Status | Note |
|---|---|---|---|---|
| `//` | # | slash-commands/SlashCommandParser.js | missing |  |
| `/?` | help | slash-commands.js | covered |  |
| `/abort` |  | slash-commands.js | covered |  |
| `/abs` |  | variables.js | covered |  |
| `/add` |  | variables.js | covered |  |
| `/addglobalvar` | incchatvar | variables.js | covered |  |
| `/addswipe` | swipeadd | slash-commands.js | covered | `SCRIPT_ACTIONS` (A37) |
| `/addvar` | addchatvar | variables.js | covered |  |
| `/api` |  | slash-commands.js | missing |  |
| `/api-url` | server | slash-commands.js | missing |  |
| `/array-unwrap` | list-unwrap | slash-commands.js | missing |  |
| `/array-wrap` | list-wrap | slash-commands.js | missing |  |
| `/ask` |  | slash-commands.js | missing |  |
| `/autobg` | bgauto | backgrounds.js | missing |  |
| `/beep` | ding | slash-commands.js | missing |  |
| `/bg` | background | slash-commands.js | partial | a chat background is set in the UI; no command |
| `/bgcol` |  | power-user.js | missing |  |
| `/branch-create` |  | bookmarks.js | partial | branching in the UI (A8); no command |
| `/break` |  | slash-commands/SlashCommandParser.js | missing |  |
| `/breakpoint` |  | slash-commands/SlashCommandParser.js | not planned | a script debugger; not planned for release |
| `/bubble` | bubbles | slash-commands.js | missing |  |
| `/buttons` |  | slash-commands.js | covered |  |
| `/caption` |  | extensions/caption/index.js | missing |  |
| `/char-create` |  | slash-commands.js | missing |  |
| `/char-delete` |  | slash-commands.js | missing |  |
| `/char-duplicate` | dupe | slash-commands.js | missing |  |
| `/char-find` | findchar | slash-commands.js | missing |  |
| `/char-get` | char-data | slash-commands.js | missing |  |
| `/char-update` |  | slash-commands.js | missing |  |
| `/chat-jump` | chat-scrollto, floor-teleport | slash-commands.js | missing |  |
| `/chat-manager` | chat-history, manage-chats | slash-commands.js | out of scope | ST's chat-manager popup |
| `/chat-reload` | re | slash-commands.js | out of scope | ST's renderer internals |
| `/chat-render` | re | slash-commands.js | out of scope | ST's renderer internals |
| `/checkpoint-create` |  | bookmarks.js | partial | branches from any message (A8); no named checkpoints |
| `/checkpoint-exit` |  | bookmarks.js | missing |  |
| `/checkpoint-get` |  | bookmarks.js | missing |  |
| `/checkpoint-go` |  | bookmarks.js | missing |  |
| `/checkpoint-list` |  | bookmarks.js | missing |  |
| `/checkpoint-parent` |  | bookmarks.js | missing |  |
| `/clipboard-get` |  | slash-commands.js | not planned | scripts never read the clipboard (privacy) |
| `/clipboard-set` | ppp | slash-commands.js | missing |  |
| `/closechat` | togglepanels | slash-commands.js | missing |  |
| `/closure-deserialize` |  | variables.js | missing |  |
| `/closure-serialize` |  | variables.js | missing |  |
| `/comment` |  | slash-commands.js | covered | a system line the model never reads (gap 5) |
| `/context` |  | slash-commands.js | missing |  |
| `/continue` | cont | slash-commands.js | covered |  |
| `/cos` |  | variables.js | missing |  |
| `/count` |  | extensions/token-counter/index.js | partial | token estimates in the context inspector (A18); no command |
| `/createentry` | createlore, createwi | world-info.js | missing |  |
| `/css-var` |  | power-user.js | missing |  |
| `/cut` |  | power-user.js | missing |  |
| `/db` | databank, data-bank | extensions/attachments/index.js | missing |  |
| `/db-add` | databank-add, data-bank-add | extensions/attachments/index.js | missing |  |
| `/db-delete` | databank-delete, data-bank-delete | extensions/attachments/index.js | missing |  |
| `/db-disable` | databank-disable, data-bank-disable | extensions/attachments/index.js | missing |  |
| `/db-enable` | databank-enable, data-bank-enable | extensions/attachments/index.js | missing |  |
| `/db-get` | databank-get, data-bank-get | extensions/attachments/index.js | missing |  |
| `/db-ingest` | databank-ingest, data-bank-ingest | extensions/vectors/index.js | missing |  |
| `/db-list` | databank-list, data-bank-list | extensions/attachments/index.js | missing |  |
| `/db-purge` | databank-purge, data-bank-purge | extensions/vectors/index.js | missing |  |
| `/db-search` |  | extensions/vectors/index.js | missing |  |
| `/db-update` | databank-update, data-bank-update | extensions/attachments/index.js | missing |  |
| `/decglobalvar` |  | variables.js | covered |  |
| `/decvar` | decchatvar | variables.js | covered |  |
| `/del` | delete, delmode | power-user.js | covered | `SCRIPT_ACTIONS`, `deleteCount` (A37) |
| `/delay` | wait, sleep | slash-commands.js | missing |  |
| `/delchat` |  | slash-commands.js | missing |  |
| `/delname` | cancel | slash-commands.js | missing |  |
| `/delswipe` | swipedel | slash-commands.js | missing |  |
| `/div` |  | variables.js | covered |  |
| `/echo` |  | slash-commands.js | covered |  |
| `/expression-classify` | classify | extensions/expressions/index.js | missing |  |
| `/expression-fallback` |  | extensions/expressions/index.js | missing |  |
| `/expression-folder-override` | spriteoverride, costume | extensions/expressions/index.js | missing |  |
| `/expression-last` | lastsprite | extensions/expressions/index.js | missing |  |
| `/expression-list` | expressions | extensions/expressions/index.js | missing |  |
| `/expression-set` | sprite, emote | extensions/expressions/index.js | partial | sprites pick automatically (A4); no manual command |
| `/expression-upload` | uploadsprite | extensions/expressions/index.js | missing |  |
| `/extension-disable` |  | extensions-slashcommands.js | not planned | extensions are the install's framework extensions (A39); scripts do not toggle them |
| `/extension-enable` |  | extensions-slashcommands.js | not planned | as above |
| `/extension-exists` | extension-installed | extensions-slashcommands.js | missing |  |
| `/extension-state` | extension-installed | extensions-slashcommands.js | missing |  |
| `/extension-toggle` |  | extensions-slashcommands.js | not planned | as above |
| `/findentry` | findlore, findwi | world-info.js | missing |  |
| `/flat` | default | slash-commands.js | missing |  |
| `/flushglobalvar` |  | variables.js | covered |  |
| `/flushinject` | flushinjects | slash-commands.js | missing |  |
| `/flushvar` | flushchatvar | variables.js | covered |  |
| `/forcesave` |  | slash-commands.js | out of scope | rpg-ai saves every write |
| `/fuzzy` |  | slash-commands.js | missing |  |
| `/gen` |  | slash-commands.js | covered | `/v1/ai_chat/gen` (gap 5), `features/prompt/gen.ts` |
| `/genraw` |  | slash-commands.js | covered | `/v1/ai_chat/gen` raw (gap 5) |
| `/getcharbook` |  | world-info.js | missing |  |
| `/getchatbook` | getchatlore, getchatwi | world-info.js | missing |  |
| `/getchatname` |  | slash-commands.js | missing |  |
| `/getentryfield` | getlorefield, getwifield | world-info.js | missing |  |
| `/getglobalbooks` | getgloballore, getglobalwi | world-info.js | missing |  |
| `/getglobalvar` |  | variables.js | covered |  |
| `/getpersonabook` | getpersonalore, getpersonawi | world-info.js | missing |  |
| `/getpromptentry` | getpromptentries | slash-commands.js | missing |  |
| `/getvar` | getchatvar | variables.js | covered |  |
| `/go` | char | slash-commands.js | missing |  |
| `/hide` |  | slash-commands.js | partial | the X-card takes a reply out of the story (A25); no general hide |
| `/if` |  | variables.js | covered |  |
| `/imagine` |  | extensions/stable-diffusion/index.js | partial | Draw a picture in the UI (A30); no command |
| `/imagine-comfy-workflow` | icw | extensions/stable-diffusion/index.js | missing |  |
| `/imagine-source` | sd-source, img-source | extensions/stable-diffusion/index.js | missing |  |
| `/imagine-style` | sd-style, img-style | extensions/stable-diffusion/index.js | missing |  |
| `/impersonate` | imp | slash-commands.js | covered |  |
| `/import` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/incglobalvar` |  | variables.js | covered |  |
| `/incvar` | incchatvar | variables.js | covered |  |
| `/inject` |  | slash-commands.js | missing |  |
| `/input` | prompt | slash-commands.js | covered |  |
| `/instruct` |  | slash-commands.js | missing |  |
| `/instruct-off` | instruct-toggle | slash-commands.js | missing |  |
| `/instruct-on` | instruct-toggle | slash-commands.js | missing |  |
| `/instruct-state` | instruct-toggle | slash-commands.js | missing |  |
| `/is-mobile` |  | slash-commands.js | out of scope | rpg-ai is one responsive UI |
| `/len` | length | variables.js | covered |  |
| `/let` |  | variables.js | missing |  |
| `/list-gallery` | lg | extensions/gallery/index.js | missing |  |
| `/listinjects` | flushinjects | slash-commands.js | missing |  |
| `/listvar` | listchatvar | variables.js | missing |  |
| `/loader-hide` |  | action-loader-slashcommands.js | out of scope | ST's loading overlay |
| `/loader-show` |  | action-loader-slashcommands.js | out of scope | ST's loading overlay |
| `/loader-stop` |  | action-loader-slashcommands.js | out of scope | ST's loading overlay |
| `/loader-wrap` |  | action-loader-slashcommands.js | out of scope | ST's loading overlay |
| `/lockbg` | bglock | backgrounds.js | missing |  |
| `/log` |  | variables.js | missing |  |
| `/lower` | lowercase, to-lower | slash-commands.js | covered |  |
| `/match` |  | slash-commands.js | covered |  |
| `/max` |  | variables.js | covered |  |
| `/member-add` | addmember, memberadd | slash-commands.js | missing |  |
| `/member-count` | countmember, membercount | slash-commands.js | missing |  |
| `/member-disable` | disable, disablemember, memberdisable | slash-commands.js | partial | members muted in group settings (A52); no command |
| `/member-down` | downmember, memberdown | slash-commands.js | missing |  |
| `/member-enable` | enable, enablemember, memberenable | slash-commands.js | partial | members muted in group settings (A52); no command |
| `/member-get` | getmember, memberget | slash-commands.js | missing |  |
| `/member-peek` | peek, memberpeek, peekmember | slash-commands.js | missing |  |
| `/member-remove` | removemember, memberremove | slash-commands.js | missing |  |
| `/member-up` | upmember, memberup | slash-commands.js | missing |  |
| `/message-name` |  | slash-commands.js | missing |  |
| `/message-role` |  | slash-commands.js | missing |  |
| `/messages` | message | slash-commands.js | covered | `SCRIPT_ACTIONS`, `scriptMessages.ts` (A37) |
| `/min` |  | variables.js | covered |  |
| `/mod` |  | variables.js | covered |  |
| `/model` | getpromptentries | slash-commands.js | missing |  |
| `/movingui` | stopping-strings, custom-stopping-strings, custom-stop-strings | power-user.js | out of scope | ST's draggable-panel UI |
| `/mul` |  | variables.js | covered |  |
| `/newchat` | delete, delmode | power-user.js | partial | New chat in the UI; no command |
| `/note` | depth | authors-note.js | partial | the author's note is edited in chat settings; no command |
| `/note-depth` | depth | authors-note.js | missing |  |
| `/note-frequency` | freq, note-freq | authors-note.js | missing |  |
| `/note-position` | pos, note-pos | authors-note.js | missing |  |
| `/note-role` |  | authors-note.js | missing |  |
| `/panels` | togglepanels | slash-commands.js | out of scope | ST's panel UI |
| `/parser-flag` | # | slash-commands/SlashCommandParser.js | not planned | ST parser compatibility flags (STRICT_ESCAPING); rpg-ai has one parser |
| `/pass` | return | slash-commands.js | covered |  |
| `/persona-create` |  | personas.js | missing |  |
| `/persona-delete` |  | personas.js | missing |  |
| `/persona-duplicate` |  | personas.js | missing |  |
| `/persona-get` | persona-data | personas.js | missing |  |
| `/persona-lock` | lock, bind | personas.js | missing |  |
| `/persona-set` | persona, name | personas.js | partial | persona picked per chat in the UI; no command |
| `/persona-sync` | sync | personas.js | missing |  |
| `/persona-update` | persona-data | personas.js | missing |  |
| `/pick-icon` | server | slash-commands.js | out of scope | ST's icon picker |
| `/pm-render` |  | slash-commands.js | missing |  |
| `/popup` |  | slash-commands.js | covered |  |
| `/pow` |  | variables.js | covered |  |
| `/preset` |  | preset-manager.js | missing |  |
| `/profile` |  | extensions/connection-manager/index.js | missing |  |
| `/profile-create` |  | extensions/connection-manager/index.js | missing |  |
| `/profile-genstream` |  | extensions/connection-manager/index.js | missing |  |
| `/profile-get` |  | extensions/connection-manager/index.js | missing |  |
| `/profile-list` |  | extensions/connection-manager/index.js | missing |  |
| `/profile-update` |  | extensions/connection-manager/index.js | missing |  |
| `/prompt-post-processing` | ppp | slash-commands.js | missing |  |
| `/proxy` |  | openai.js | not planned | reverse-proxy presets are an install concern, not a script one |
| `/qr` |  | extensions/quick-reply/src/SlashCommandHandler.js | partial | quick replies run from their buttons (A32); no command |
| `/qr-arg` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-chat-set` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-chat-set-off` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-chat-set-on` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-contextadd` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-contextclear` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-contextdel` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-create` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-delete` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-get` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-list` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-create` | qr-presetadd | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-delete` | qr-presetdelete | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-list` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-off` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-on` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-set-update` | qr-presetupdate | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qr-update` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/qrset` |  | extensions/quick-reply/src/SlashCommandHandler.js | missing |  |
| `/rand` |  | variables.js | covered |  |
| `/random` | delete, delmode | power-user.js | missing |  |
| `/reasoning-collapse` | collapse-reasoning | reasoning.js | missing |  |
| `/reasoning-expand` | expand-reasoning | reasoning.js | missing |  |
| `/reasoning-format` | format-reasoning | reasoning.js | missing |  |
| `/reasoning-get` | get-reasoning | reasoning.js | missing |  |
| `/reasoning-parse` | parse-reasoning | reasoning.js | missing |  |
| `/reasoning-set` | set-reasoning | reasoning.js | missing |  |
| `/reasoning-template` | reasoning-formatting, reasoning-preset | reasoning.js | missing |  |
| `/reasoning-toggle` | toggle-reasoning | reasoning.js | partial | thinking folds in the UI (A45); no command |
| `/regenerate` | regen | slash-commands.js | partial | a Regenerate button; no command |
| `/regex` |  | extensions/regex/index.js | missing |  |
| `/regex-preset` |  | extensions/regex/index.js | missing |  |
| `/regex-state` |  | extensions/regex/index.js | missing |  |
| `/regex-toggle` |  | extensions/regex/index.js | missing |  |
| `/reload-page` |  | extensions-slashcommands.js | not planned | scripts never reload the app |
| `/rename-char` |  | slash-commands.js | missing |  |
| `/renamechat` |  | slash-commands.js | partial | a chat title is edited in the UI; no command |
| `/replace` | re | slash-commands.js | covered |  |
| `/reroll-pick` |  | slash-commands.js | missing |  |
| `/resetpanels` | resetui | power-user.js | out of scope | ST's panel UI |
| `/round` | length | variables.js | covered |  |
| `/run` | call, exec | slash-commands.js | covered |  |
| `/secret-delete` |  | secrets.js | not planned | scripts never read or write API secrets (sandbox rule) |
| `/secret-id` | secret-rotate | secrets.js | not planned | scripts never read or write API secrets (sandbox rule) |
| `/secret-read` | secret-find, secret-get | secrets.js | not planned | scripts never read or write API secrets (sandbox rule) |
| `/secret-rename` |  | secrets.js | not planned | scripts never read or write API secrets (sandbox rule) |
| `/secret-write` |  | secrets.js | not planned | scripts never read or write API secrets (sandbox rule) |
| `/send` |  | slash-commands.js | covered | `SCRIPT_ACTIONS` (A37) |
| `/sendas` |  | slash-commands.js | covered |  |
| `/setentryfield` | setlorefield, setwifield | world-info.js | missing |  |
| `/setglobalvar` |  | variables.js | covered |  |
| `/setinput` |  | slash-commands.js | covered |  |
| `/setpromptentry` | setpromptentries | slash-commands.js | missing |  |
| `/setvar` | setchatvar | variables.js | covered |  |
| `/show-gallery` | sg | extensions/gallery/index.js | missing |  |
| `/sin` |  | variables.js | missing |  |
| `/single` | story | slash-commands.js | missing |  |
| `/sort` |  | variables.js | missing |  |
| `/speak` | narrate, tts | extensions/tts/index.js | partial | read aloud in the UI; no command |
| `/sqrt` |  | variables.js | missing |  |
| `/start-reply-with` |  | power-user.js | missing |  |
| `/stop` | generate-stop | slash-commands.js | partial | a Stop button; no command |
| `/stop-strings` | stopping-strings, custom-stopping-strings, custom-stop-strings | power-user.js | missing |  |
| `/sub` |  | variables.js | covered |  |
| `/substr` | substring | slash-commands.js | covered |  |
| `/summarize` |  | extensions/memory/index.js | partial | rolling summary on request in the UI; no command |
| `/swipe` |  | slash-commands.js | partial | swipes browsable in the UI; no command |
| `/sys` | nar | slash-commands.js | covered |  |
| `/sysgen` |  | slash-commands.js | covered | gen, kept as a narrator line (gap 5) |
| `/sysname` |  | slash-commands.js | missing |  |
| `/sysprompt` | system-prompt | sysprompt.js | missing |  |
| `/sysprompt-off` | sysprompt-disable | sysprompt.js | missing |  |
| `/sysprompt-on` | sysprompt-enable | sysprompt.js | missing |  |
| `/sysprompt-state` | sysprompt-toggle | sysprompt.js | missing |  |
| `/tag-add` |  | tags.js | partial | tags edited on the card (A51); no command |
| `/tag-exists` |  | tags.js | missing |  |
| `/tag-import` |  | tags.js | missing |  |
| `/tag-list` |  | tags.js | missing |  |
| `/tag-remove` |  | tags.js | partial | tags edited on the card (A51); no command |
| `/tempchat` | togglepanels | slash-commands.js | missing |  |
| `/test` |  | slash-commands.js | covered |  |
| `/theme` |  | power-user.js | missing |  |
| `/times` |  | variables.js | covered |  |
| `/tokenizer` | uppercase, to-upper | slash-commands.js | missing |  |
| `/tokens` |  | slash-commands.js | missing |  |
| `/tools-invoke` | tool-invoke | tool-calling.js | missing |  |
| `/tools-list` | tool-list | tool-calling.js | missing |  |
| `/tools-register` | tool-register | tool-calling.js | missing |  |
| `/tools-unregister` | tool-unregister | tool-calling.js | missing |  |
| `/translate` |  | extensions/translate/index.js | partial | per-message translate in the UI; no command |
| `/trigger` |  | slash-commands.js | covered | `SCRIPT_ACTIONS` (A37) |
| `/trimend` |  | slash-commands.js | partial | `/trim` trims both ends; no one-sided trim |
| `/trimstart` |  | slash-commands.js | partial | `/trim` trims both ends; no one-sided trim |
| `/trimtokens` |  | slash-commands.js | missing |  |
| `/unhide` | getmember, memberget | slash-commands.js | partial | the X-card is undoable (A25); no general unhide |
| `/unlockbg` | bgunlock | backgrounds.js | missing |  |
| `/upper` | uppercase, to-upper | slash-commands.js | covered |  |
| `/var` |  | variables.js | missing |  |
| `/vector-chats-state` |  | extensions/vectors/index.js | missing |  |
| `/vector-files-state` |  | extensions/vectors/index.js | missing |  |
| `/vector-max-entries` |  | extensions/vectors/index.js | missing |  |
| `/vector-query` |  | extensions/vectors/index.js | missing |  |
| `/vector-threshold` |  | extensions/vectors/index.js | missing |  |
| `/vector-worldinfo-state` |  | extensions/vectors/index.js | missing |  |
| `/vn` |  | power-user.js | missing |  |
| `/while` |  | variables.js | covered |  |
| `/wi-get-timed-effect` |  | world-info.js | missing |  |
| `/wi-set-timed-effect` |  | world-info.js | missing |  |
| `/world` |  | world-info.js | missing |  |
| `/yt-script` |  | scrapers.js | not planned | a YouTube transcript scraper; not planned |
