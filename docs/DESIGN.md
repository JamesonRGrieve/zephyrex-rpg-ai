# zephyrex-rpg-ai: design

An AI roleplay and AI game-master app that competes with SillyTavern. It plays inside a real
world (the wiki) and at a real table (the VTT), so its characters remember canon, keep
secrets and roll real dice. It is built first. The wiki and VTT get its shared pieces
ported back. Suite context and ownership: [SUITE.md](SUITE.md). Entity fields for
cards and lorebooks: [OBJECT_PLAN](https://github.com/JamesonRGrieve/zephyrex-rpg-wiki/blob/main/server/OBJECT_PLAN.md) §4 _Phase 4 — Tier AI_.

## The operator's requirements (2026-11-20)

> "When zephyrex RPG comes up, we need support for out of character messages to the GM
> agent, multiple models on multiple servers for parallelism, decision models like jev for
> combat decisions etc."

Each has its own section below:

- [Out-of-character messages to the GM agent](#out-of-character-ooc)
- [Multiple models on multiple servers](#multiple-models-on-multiple-servers)
- [Decision models (Jev-style)](#decision-models-jev-style)

"Jev" is defined in the Zephyrex SOP, _AI Environment → Decision models (Jev-style System-1)_.

Added the same day:

> "We also need scenario modeling and campaign framing. And we need support for narrative
> mode as well as rigid mechanical mode."

- [Campaign framing](#campaign-framing)
- [Scenario modeling](#scenario-modeling)
- [Narrative and mechanical modes](#narrative-and-mechanical-modes)

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
8. **A GM with a plan and a contract.** A campaign frame agreed at session zero, scenarios
   modeled as moving parts (clocks, clues, agendas) and rehearsed before play, and play that
   is as loose or as rules-tight as the table chooses.

## The composed suite (the operator, 2026-11-21)

rpg-ai runs **composed**: one server loading the wiki's and the VTT's extensions with its own,
one client, one database ([SUITE.md](SUITE.md), _Together_). The operator, 2026-11-21: "That
should've been the design from the start." rpg-ai keeps **no world data and no table state of
its own**. Its duplicate stores are **removed entirely**, sandbox chats included; SillyTavern
files import straight into the wiki.

| rpg-ai had (removed)                               | Who owns it now                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Lorebooks / World Info (ai_lorebook)                | Wiki entities (persons, locations, factions, items, hooks, journals, lore) and setting canon (S6) |
| Character cards for NPCs and PCs (ai_character)     | Wiki persons (genealogy + rpg_core); their AI voice is fields on the person        |
| Personas                                            | The player's wiki person; the seat picks one                                       |
| Scenario framings (campaign_frame, A57)             | The wiki's campaign in its setting (rpg_core, S6); the system from the VTT          |
| Prep sheets: clocks, secrets, clues, beats (A60)    | Wiki hooks (quests, mysteries, plot threads) and GM-private journals               |
| Session records and summaries (ChatSession)         | Wiki session journals (session_report) and rpg_log                                 |
| Chat objectives                                     | Wiki hooks with quest status                                                       |
| Data bank documents                                 | Wiki entries and their attachments (S2c)                                          |
| Party and seats (chat cast, seat, CampaignPlay)     | VTT table seats (rpg_table)                                                        |
| Dice and rolls (`/roll`, narration)                  | VTT rpg_dice and the `test` ability                                                |
| Scene backgrounds and pictures                      | VTT scenes and wiki maps; generated images attach to them                         |

**rpg-ai keeps** what is only the AI's: the story tree of a play (messages, swipes, branches,
rewind and fork), model endpoints and roles, presets and samplers, instruct and context templates,
prompt assembly, STscript, quick replies, regex, the AI's own memories, the GM agent, and the
decide and canon judges.

**SillyTavern parity is behaviour over wiki records**, not a second store:

- World Info activation (keys, recursion, timed effects) runs over wiki entries, keyed by their
  names and aliases; an imported World Info file becomes wiki entries.
- A character card imports as a wiki person with its voice (description, personality, examples,
  first message); a reply speaks as that person.
- A persona is the player's person; Author's Note, objectives and the data bank read the wiki.

**The play model, composed:** a **scenario** is a wiki campaign in a setting (Solenne, in
Warhammer 40,000); a **campaign** (a playthrough) is rpg-ai's story tree for that wiki campaign,
with a VTT table whose seats hold its party; a **session** is a wiki session journal, its summary
what later sessions read; the **seat** is a VTT seat, hot-swapped between the GM and any person.

**Order of work:** compose (pins, extensions, migrations; done when the composed server boots and
passes every product's suite); move the operator's data into wiki records (the Wiki's vault
importer, and a conversion of what rpg-ai imported); repoint rpg-ai's reads (prompt, canon,
cast, seats, rolls) at the wiki and VTT; remove the duplicate stores and their pages; the wiki's
pages embedded (S7) and the VTT's play UI.

## The play model (the operator, 2026-11-21)

Campaign play is not chats. "The concept of chats should not exist. It should be sessions."

| Thing                   | What it is                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scenario**            | A campaign framing: the world and the premise to play in (Solenne, Dunmarch). It holds the frame (premise, genre, tone, themes, truths, the GM's style), the cast of characters, the lorebooks, the opening situation, and the GM's prep (clocks, secrets with their clues, beats, outcomes). Today's campaign frame (A57) and scenario (A60) records merge into it.                 |
| **Campaign**            | A save state of a scenario: one playthrough with its own **party** of playable characters. Campaigns of the same scenario can have different parties. A campaign can be **rewound** (back to an earlier moment, with what came after kept as a branch to return to) or **forked** (copied up to a moment into a new campaign that goes its own way): either, at the person's choice. |
| **Session**             | A segment of a campaign's story, "save points, essentially": each starts where the last ended. A session's end is where the story so far is compacted and summarized (the session report, A24), so later sessions read the summary, not every line.                                                                                                                                  |
| **Seat**                | Who the person is right now, **hot-swappable at any time** within a session: the GM, or **any character at all**. An NPC the person takes over joins the party while played. The AI pilots everyone else: the party members who speak up, and the GM's narration when the person isn't the GM. No separate chat or session per role.                                                 |
| **One-on-one roleplay** | SillyTavern's character chat and group chat stay, as **sandbox** play: their own section at the bottom of the navigation, apart from scenarios and campaigns.                                                                                                                                                                                                                        |

Outcomes are decided separately: the [resolution mode](#narrative-and-mechanical-modes).

### Settings and systems (the operator, 2026-11-21)

Scenarios and campaigns sit inside a **setting**, and each setting offers the **systems** that can
play in it.

| Thing       | What it is                                                                                                                                                                                                                            | Examples                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Setting** | The universe a scenario takes place in: its canon (what every character in it would know), tone and vocabulary. It encloses scenarios, and through them campaigns. A setting's canon is what the red canon notice is checked against. | Warhammer 40,000; Warhammer Age of Sigmar; Warhammer Fantasy; Dungeons & Dragons; Fallout; Modern                                        |
| **System**  | A mechanical rule set for a setting: how actions resolve (checks, combat, damage, advancement). A setting has several; a campaign chooses one.                                                                                        | For Warhammer 40,000: the FFG lines (Dark Heresy, Rogue Trader, Deathwatch, Black Crusade, Only War), Wrath & Glory, Imperium Maledictum |

- **A campaign's system defines its mechanics when the game is mechanical**, and is ignored when it is narrative: it follows the [resolution mode](#narrative-and-mechanical-modes) (narrative, mechanical or hybrid; hybrid uses the system only at real stakes).
- **Mechanics are never invented by a model** (this repo's rule): the system's rolls, checks and state changes go through the VTT's rules engine (zephyrex-vtt's rpg_systems), which knows each system; rpg-ai names the campaign's system and asks it.
- A scenario names its setting; a campaign names its system (from its setting's). Solenne and Dunmarch are Warhammer 40,000 scenarios; their campaigns choose Dark Heresy 2e.
- Settings and systems are shared with the suite (the wiki's worlds and the VTT's systems), reached through their APIs, never re-defined here.

### Canon warnings (the operator, 2026-11-21)

Whoever writes a line, a player or the GM (person or AI), it is checked against canon:

| Notice             | When                                                                                                                                                                                                                                                                      | Example                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Yellow warning** | The line is believed to contravene **established canon**: the campaign's own facts so far (its frame's truths, lorebooks, earlier sessions' summaries, the scenario) or the setting's canon, but not flagrantly: a likely slip, a contradiction the table may have meant. | A character calls the Transit Hub's bar by the wrong name; a dead NPC is spoken of as alive. |
| **Red notice**     | The line **flagrantly disregards in-universe canon**: something any character in the setting would know.                                                                                                                                                                  | A tech-priest not knowing who the Omnissiah is.                                              |

- The check is the decision model (the `decide` role, Jev-style): a `score` question for "contradicts established canon" and one for "flagrantly breaks in-universe canon", asked with the line, the speaker's card, and the canon in reach (the lore entries the line activates, the frame's truths, the session summaries). Thresholds for yellow and red sit in the contract. No decide model, no check.
- A person's line is checked as they write it: the notice shows on the composer before they send, with the reason in a sentence, and they may send anyway. An AI line is checked after it is written: the notice sits on the message, and a red one offers _Write another reply_.
- Notices are table information, never part of the story: they don't enter the prompt (the OOC rule).
- The warning says why (the canon it conflicts with, quoted from the lore or summary where one is found), so the person can correct it or decide it's intended.
- **Both warnings can be turned off for a campaign for good** (the operator, 2026-11-21: "for radical looney toon campaigns"): a "Turn off canon warnings for this campaign" button on the notice, undone in the campaign's settings. A campaign with them off runs no canon check at all.

### The play-test rulings (the operator, 2026-11-21)

The first live play-tests of Voidship Escapade on the composed suite set these rules. Each is
binding; the owner of each piece is named.

**Scenarios, campaigns and canon layers**

- **Copy on start.** A scenario is a wiki campaign marked `is_scenario`, which play never edits.
  Starting a campaign instantiates it (`POST /v1/campaign/{id}/instantiate`): a playthrough with its
  own copy of every person, place, item, journal, hook and link, linked back by `scenario_id`. Play
  changes only the copy. Setting canon is shared and read-only. (Wiki: instantiate; rpg-ai: Start.)
- **Scenarios are grouped by setting, then by system**, and carry **provenance** (homebrew,
  official or adapted, with the source; official material is parsed in for personal use) and
  **play-style tags** (freeform, combat-heavy, narrative, mystery, exploration, social, horror,
  dungeon-crawl, plus the person's own) to filter by. (Wiki: provenance, world_taxonomy.)
- **Scenarios list no characters.** The cast belongs to the campaign; the scenario holds its people
  as wiki records.
- **Setting canon is the official material:** the 40k compendiums (the wh40k-rpg Foundry system's
  printed-book records) and, for D&D, the whole 5e SRD, imported as setting-wide records with
  provenance official and their book and page. (Wiki: compendium_import.)

**The opening**

- **It tells, never asks.** The narrator's first line is the framing note's Opening Situation, then
  where the seat's character is and who is there. It never asks "where are you?".
- **It never spoils.** A campaign's description is a spoiler-free subtitle; GM truths (a Gellar
  field flicker) never appear in openings, briefings or subtitles.
- **Starting positions per character.** Each person (NPCs especially, PCs too) starts at their own
  location: the wiki person's location in the scenario, else their token in the VTT's initial scene,
  else the framing's default. (Wiki: location_id; VTT: scene state; rpg-ai: openingFor.)

**Who speaks, and for whom**

- **Nobody speaks for the person, and nobody is narrated speaking.** The narrator narrates the
  world, the scene and outcomes. In the same response it may think and act for NPCs and for the AI
  party members (never the person's own character), but only as **interludes credited to them**:
  speaker-tagged segments saved and shown as that character's own lines, never prose such as
  "she laughed and said…" (the operator, 2026-11-21). A character never decides
  what the person's character says, does, feels or knows, and never voices another cast member.
  This is held by the system prompts (every cast member named, the person's seat first, with the
  party roster and the shared briefing) and by stop strings at cast names, with contract cases
  taken from the play-test transcripts. It is not held by a model post-check, which would spend a
  second generation on every line (the operator: "Catching it after generation is a horrendous
  waste of compute"); at most a free text match on cast names. A violation is a bug that blocks play.
- **Proportion.** A reply's length follows what it answers: a small action gets a small reaction,
  or none.
- **The party knows itself.** Party members travelling together know each other; every party voice
  carries the roster.
- **Secrets stay with the GM.** Records marked GM-only (an NPC's secrets, the scenario's truths,
  briefings for the GM) reach only the GM and narrator prompts and that NPC's own voice. To anyone
  else a GM-only person is just a name. The same holds for the data bank.

**Structured lines** (the operator, 2026-11-21)

- **The person queues what their character says and does** before sending: **Say** (typed straight
  into the quotes, with to whom it is said) and **Do** (typed after the character's name: "Tessaly
  Kord bangs on the wall."). As the GM, each item also names who speaks (any NPC, or the narrator).
  Several items queue and send as one message, structured one per line:
  `Tessaly Kord (to Wren): "Quiet."`, `Tessaly Kord bangs on the wall.`, `Narrator: The lights flicker.`
- **The AI answers in the same structure,** so every line is credited to whoever speaks or acts; the
  story renders each line under its speaker.
- **As the AI writes, the view switches** to a character the moment a line opens with their name:
  that character is shown typing.
- **Schema-constrained turns** (the operator, 2026-11-21: "Still fucking up dialogue with the
  narrator and character sections"): `generate` with `structured: true` asks a chat API for JSON items
  (`kind` narrate/say/do, `speaker`, `target`, `manner`, `text`; contract `structured`), streams them
  as `item_start`/`item_text`/`item_end`, makes anyone unnamed a person (`person`), saves each
  speaker's run as its own message (`saved`), then `done`. Credit comes from the schema, never from
  splitting prose. The seat's first item ends the turn; a model that answers prose falls back to plain
  deltas. Narrate first; the voices follow. Later: server-saved lines skip the person's `stored`
  regex scripts, which the client applies on its own saves.

**The turn loop** (the decision model runs the table)

1. The person writes a line. Something always answers it: a decided pause straight after their own
   line becomes the GM's narration.
2. After any character's line, the decision model decides **whether a roll is called for, and
   which**: a test from the campaign's system pack (the VTT's test options for that character), or
   the light dice style when there's no pack or sheet. The VTT rolls it; the result is a roll line.
3. **Then the narrator, always,** narrates the roll's outcome as it fell, never changing it.
4. The decision model decides who goes next: a character **present in the scene** (a VTT token, a
   location at or inside the scene's, or someone just in the scene's lines), one **reachable by
   vox** when the line calls for it, **the GM interjecting**, or **a pause** for the person. What a
   pause means depends on the seat: as the GM, when the story needs a ruling; as a character, when
   that character is addressed or it is their moment.
5. The turn-order bar is retired; manual orders remain selectable in chat settings.

**A living world**

- **Routines and motivations.** Every person has a routine (where they are and what they do, by
  in-world time) and motivations. Present characters act from their motivations.
- **The world tick.** As in-world time advances (scene changes, time skips, every few turns), the
  GM agent moves each absent NPC by its routine and motivations, choosing only real locations, and
  pilots its token on the map (the VTT's pilot_token, with pathing and walls). Arrivals into the
  party's scene are narrated. Moves are GM-side; the person sees only what their characters see.
- **Last known locations.** The right-hand panel lists the characters present, and the last known
  location of everyone else, as the party last saw them (never their live position).
- **The right-hand panel's sections are mutually exclusive accordions,** and every piece of
  context lives there, not in the story: who is present, last known locations, the character
  sheet, combat order, inventory, looting.
- **Chat and map swap in one tap,** from a control on both views (the map is the VTT's scene view
  of the campaign's current scene).

**Characters**

- **The pickers say who someone is:** a role or class and a one-line description, with player
  characters and NPCs listed apart (for other ways to play: the person may play any NPC).
- **Pictures everywhere**, uploaded or linked from outside (fandom, wikis), shown with no referrer.
- **A character sheet in the session**, from the VTT; rolling with no sheet falls back to a formula,
  never an error.
- **Character building, both ways, at parity with the wh40k-rpg Foundry system and OrcPub:** RAW
  building from each system's pack in the VTT (origins, characteristics, aptitudes, XP, talents
  with prerequisites, psychic powers, gear; 5e species, classes, backgrounds, ability scores,
  level-up, spells, multiclassing), illegal choices shown and refused; and narrative building in
  the wiki (concept, appearance, personality, history, relationships, voice), with "Make this RAW"
  handing off to the VTT builder.

**The narrator's style**

- **Sliders pick the model and tune it** (the operator, 2026-11-21): spice, verbosity, darkness and
  humour in the campaign's settings. Each model endpoint carries reputation scores (spice
  tolerance, verbosity, prose, darkness, humour, instruction adherence, speed), seeded from the
  models' known reputation and editable on the Models page. The narrator uses the story model
  nearest the sliders, with adherence as a floor; an endpoint chosen for the chat always wins.
  **No model under 10B parameters ever narrates** (the operator: "Too stupid"); a mixture of
  experts counts by its total size.
  Verbosity also sets the length; spice and darkness set the tone line, always capped by the
  campaign's table-safety rating.

**Tooling**

- Imports and wipes use the framework's batch routes (plural create, batch update and delete),
  never one request per record.

### The play-test rulings (the operator, 2026-11-21 and 2026-11-22)

Live play-tests of the tavern campaign set these rules. Each is binding. **Status** is what the code
does as of this entry: _live_ (in the deployed build), _built_ (pushed, awaiting a ship), _open_ (not
done yet). The owner is named where it isn't rpg-ai's client.

**Who says and does what**

- **Speech in bubbles, actions credited.** A character's quoted words render as a speech bubble (tail
  at the bottom left), styled by manner: speak, whisper, shout, vox, voxcast. Actions render as that
  character's action with an icon, never as faint narrator text. _Live._
- **The split must be right.** "The split of character actions and dialogue from the narrator is
  critical." Quotes inside narration become the speaker's bubble; "Name action" lines are theirs; a
  name followed by a noun ("The Rogue Trader vessel…") is narration; an action keeps the actor's
  sentences, and the scene after it is narration ("blinks slowly. Around the room…"). _Live/built._
- **The decision model labels every line** (who acts, speech or action or narration, the icon from the
  full 40-kind library), using the lines before it as context: "A second tankard follows the first" is
  the thrower's throw; stray asides are dropped. Labels are kept on the message (line_labels) and the
  message renders from them. _Built (client); server in progress (Parity)._
- **At least 40 action icons** (water droplets for relieving oneself, a tankard for drinking, a throw…).
  _Live._
- **Things happen to the seat's character, never by it.** The AI never voices, moves or decides for
  the person's character; narration cuts at the first thing it would have them do by choice. _Live._
- **Characters act on what they know and feel** (dispositions, home; a barkeep never asks directions
  in her own town). _Open (Parity: prompt and knowledge)._
- **One model per format.** Each model gets the instruction wording that works for it, found by a
  direct eval over all models. _On hold by the operator ("no eval yet")._
- **No em dashes** in the story. _Live._
- **No response token caps** ("moldy Band-Aid"). _Live._
- **A thinking model's reasoning never enters the story;** story turns run with thinking off. _Built
  (client strip); thinking-off server-side in progress (Parity)._

**Mechanics**

- **No model-invented dice.** Rolls use the system's own tests (5e d20, DH2 d100) through the VTT; a
  model never writes a formula. _Live._
- **Targets are real.** Say and Do targets are typed, suggesting only valid ones: those present, or
  known people reachable by a vox or by spell; any name may be typed. _Built._
- **Speech modes follow the setting and the sheet.** Vox and voxcast only in 40k and only with a vox in
  hand; Message or Sending in D&D only when the spell is known. _Built (Parity + VTT)._
- **The GM asks about a target only when there is none:** never when the line names one (a person or
  a thing, "on the hearth"), never offering anyone who isn't present (no canon creatures), always with a
  box to type something else; the question says "The GM asks". _Built._

**The table and the GM**

- **Out of game** sits beside Say and Do and replaces "Table talk" and "Ask the GM"; the channel switch
  is gone. Out of game is between the GM and you, the player, not your character, and is styled apart
  from the narrator. _Live._
- **Canon warnings** check the person's lines and the AI's; a warning on an AI line rewrites it once
  with the problem named. A warning is one line with Details, which opens the bottom drawer holding the
  finding and the button to turn warnings off for the campaign. _Built._
- **A rewritten line shows a small icon** that opens its first answer and reasoning, and why it was
  rewritten, in the drawer. _Built._
- **Regenerate on the person's line resubmits it** and starts the NPC turns from there; on a narration
  it writes another telling. _Built._
- **The person's line starts a new round:** a round still running stops, and nothing it writes later
  is saved (it once made a 2/2 that replaced the person's lines). _Built._
- **The round shows the step it is on** (reading your line, deciding a roll, who acts next…), so a
  quiet round never looks dead. _Built._
- **NPC authoring.** When a line meets someone who doesn't exist (the barkeeper), the decision model
  decides an NPC is needed and the GM authors one first, with an in-chat progress bar ("Authoring new
  NPC (barkeeper)"): campaign-only, an Elevate to scenario button on their profile, a picture when a
  drawing model is set, a sheet authored or adapted from the compendium; then they act. _Live (Parity,
  Wiki, VTT)._

**Places and the map**

- **A location change is a grand banner with a map icon,** never a markdown title, named from the
  map's truth, not the narrator's wording. Banners show sub-locations: the place as the title, its
  town and region as the subtitle. _Live._
- **The opening starts with the location banner,** then the situation, then who is with you, never the
  place's raw wiki entry. _Live._
- **The GM moves people on the map** from what is said in the story, and the map is one tap away. _Live._

**Screens**

- **The app bar holds the play controls on one row on a phone,** with no "Play" title and no sticky
  header at the start of the chat; the Context button is the rightmost; the ⋯ menu groups its items in
  submenus. _Built._
- **Context lives in the app wrapper's right sidebar,** never a bottom sheet; the bottom drawer is part
  of the same app wrapper (client-framework). _Live/built._
- **Send and Stop sit at the right of the composer row,** never on a row of their own. _Built._
- **Auto-scroll only when the person is at the bottom.** _Live._
- **Pull down on the app bar to reload,** at any scroll. _Built._
- **Initials are letters only** ("Parentheses are not valid last initials"). _Live._
- **Switching tabs never breaks play:** the chat stays, a cut reply is asked for again, and starting a
  campaign carries on after a tab switch. _Built/live._
- **The down page retries every 10 s** with an animation, for the page asked for. _Live._
- **Screens of cogitators and data-slates** have their own styling, and the model may colour text
  itself (the bright red). _Live._
- **Chat settings** hold only what a campaign can change in play: no lorebooks or World Info, no
  campaign or scenario choice. _Live._
- **Campaigns under a scenario** each have a concise status line kept current by play, never the
  scenario's name repeated. _Live._

**Characters and content**

- **Pregens per setting:** a couple per class, generic to the setting. _Live._
- **The campaign start shows only the scenario's own people.** _Live._
- **The VTT's RAW builder** (ability scores, creation choices) is in Context's character sheet. _Live._
- **The 40k and 5e SRD compendiums are imported** into the wiki as setting canon. _5e live; the 40k
  all-lines import is open (after the canon-reading fix ships)._
- **The whole D&D and 40k book library will be in the wiki,** so context is retrieval, never a scan:
  one context per turn (later prompts in a turn add only what new lines name), an indexed name lookup
  (world_keys), then hybrid retrieval (full text, trigram and pgvector embeddings from
  nomic-embed-text-v1.5) over chunked, tagged passages scoped to the campaign's setting and system;
  lite gets the same through better-sqlite3 and sqlite-vec. _Name index built; hybrid in progress
  (Wiki); per-turn snapshot built (Parity)._

**Starting a campaign**

- **New character** (built with the VTT's character builder) and **Freeform character** (a name only,
  developed during play by the GM agent; narrative campaigns only) sit beside the scenario's and the
  setting's characters. _Built (client); freeform development and the mode read in progress (Parity)._
- **Starting takes the whole page:** once Start is pressed the copy and boot progress covers everything;
  nothing can be edited. _Built._
- **Prefab characters are complete at start:** every pregen carries its full character sheet and
  starting inventory by the system's creation rules, and the scenario copy carries them over. _Open (VTT
  build_pregen and a backfill of the 112 pregens; Wiki copies traits and inventory)._
- **A seat with no place starts where the opening says,** else where the scenario's people are, and is
  put there. _Built._
- **Every scenario is playable:** people have kinds, the opening is a real situation (never a pointer to
  other notes), there is a place to start; every import and generation validates this and fails loudly.
  Scenarios are tagged by origin: **Imported** (from transcripts and vaults) or **Stereotypical**
  (generated). _Wiki repair built; prod repair after the deploy._

**The decision model**

- **Three tries** when it chokes; then the narrator carries the moment, prompted wide enough to give the
  party and the people present their reactions. _Built (client); server retries and wording in progress._

**The map and the dice**

- **Full map control from play:** the GM picks and makes scenes, places and removes tokens (an authored
  NPC is placed beside the seat), opens doors, measures, pings and paints fog; players move their own
  token, measure, ping, and see only what their token sees. _Scene list built; the rest in progress (VTT)._
- **The dice tray rolls in 3D** (the server's values, never the renderer's), looks designed rather than a
  form, and defaults to the system's die (d20 for 5e), never d100. _In progress (VTT)._

**Operations**

- **Dev and release-candidate tests never use the prod model tier** (gigabyte); they use the desktop.
- **Deploys only when the operator unfreezes;** say before one, since it restarts the server.
- **The summaries model stays on the 24 GB tier;** never add models to the 72 GB tier.

### Mapping onto what exists

_Superseded by [The composed suite](#the-composed-suite-the-operator-2026-11-21): the records below are rpg-ai's own, built standalone; they move to the wiki and the VTT and are then removed._

- A campaign's story is one tree of messages, as a chat's is now: swipes and branches carry over. Rewind moves the campaign's head back to a message; fork copies the path to that message into a new campaign.
- A session records where it starts and ends in that tree, its summary and report. Starting a session compacts the earlier ones into their summaries.
- The seat is the campaign's current seat (today's chat `seat`, A20, plus the character the person plays), changed from the session's top bar at any time; turns are decided by the seat (features/chat/seat).
- A campaign's party is its list of characters (today's chat cast); an NPC taken over is added for as long as it's played.
- Sandbox chats keep today's chat records unchanged.

## Feature parity matrix: full parity

**The target is full feature parity with SillyTavern** (operator, 2026-11-20): every
feature it offers, including its extension system and STscript, is planned here. Nothing
is left out of scope.

Sources: SillyTavern 1.19.1's source and docs, audited item by item on 2026-11-21 in
`docs/research/sillytavern-audit.md`: 230 features (89 covered, 35 partial, 98 missing) and all
293 slash commands (46 covered), each "covered" checked in the code, with the release-blocking
gaps ranked. That ranking is rpg-ai's release order. The Progress table's "Not yet" column
carries each row's gaps. "Ours" marks what SillyTavern does not have.

| #                                  | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Seen in                                                                                                                                                                                                                                                                                                                                                                 | Lite                    | SaaS |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| **Characters**                     |
| A1                                 | Character cards V2/V3: description, personality, scenario, first message, alternate greetings, examples, system prompt, post-history instructions, creator notes, extensions                                                                                                                                                                                                                                                                                                                                                                                 | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A2                                 | Import/export cards as PNG (embedded JSON) and JSON; batch import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A3                                 | Personas: your own name, description and avatar, per chat or default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A4                                 | Expression sprites and visual-novel mode (expression chosen by a decision model)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A5                                 | Character linked to a wiki person: card fields filled from the entity; canon edits flow both ways                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| **Chat**                           |
| A4                                 | Expression sprites: a picture per feeling; the model picks which fits each line from the character's own labels only (a decision model's rule), shown on a stage                                                                                                                                                                                                                                                                                                                                                                                             | a visual-novel layout. Done: a dedicated decision model picks the expression when one serves the decide role (Self Hosted AI's d1-2b; the protocol twins `features/decide`, `ai_chat/Decide.py`, contract/decide-cases.json), the summary model otherwise                                                                                                               |
| A6                                 | Streaming replies; stop; continue; regenerate; impersonate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A7                                 | Swipes (alternative replies per turn), kept and browsable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A8                                 | Branches and checkpoints: fork from any message, tree view                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A9                                 | Edit, delete and move any message; bookmarks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A10                                | Group chats with turn order (manual, list, natural via decision model)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A11                                | Out-of-character channel and table notes (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A12                                | Chat search, chat library with folders and tags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A13                                | Import SillyTavern chats (JSONL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                       | ✓                       | ✓    |
| **Context**                        |
| A14                                | Lorebooks / World Info: the full SillyTavern entry surface (keys, secondary keys, logic, depth, position, order, probability, groups, sticky, cooldown, delay, recursion)                                                                                                                                                                                                                                                                                                                                                                                    | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A15                                | Lorebooks generated from the wiki and kept in sync; entry relevance gated by a decision model on top of keys                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A16                                | Author's note, system prompt override, prompt manager with ordered, toggleable sections and per-section token budgets                                                                                                                                                                                                                                                                                                                                                                                                                                        | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A17                                | Instruct and context templates; sampler presets per model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A18                                | Token counter and a context inspector: exactly what was sent, by section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A19                                | Long-term memory: rolling summaries and recall by meaning (framework `ai_memories`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | SillyTavern (Summarize, Vector Storage)                                                                                                                                                                                                                                                                                                                                 | ✓                       | ✓    |
| **Game**                           |
| A20                                | AI GM agent with a configurable style (tone, pacing, difficulty, verbosity, person, content rating)                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A21                                | Grounded mechanics: rolls, checks, damage and conditions through the VTT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓ (with the VTT loaded) | ✓    |
| A22                                | Decision models for combat and other typed choices, with a "why" panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A23                                | Scene awareness: what each character can perceive, from the VTT scene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓ (with the VTT loaded) | ✓    |
| A24                                | Session reports and journals written back to the wiki                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A25                                | Safety tools: lines and veils, X-card, pause, content rating                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| **Models**                         |
| A26                                | Any OpenAI-compatible endpoint, plus the framework's providers (Anthropic, OpenAI, Google, DeepSeek, xAI, Bifrost, local GGUF)                                                                                                                                                                                                                                                                                                                                                                                                                               | SillyTavern (many backends)                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A27                                | Model roles with pools of servers, parallel fan-out per turn (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A28                                | A model status page: each role's servers, load, latency, failures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| **Media**                          |
| A25                                | Safety tools: content rating, lines and veils in every prompt; the X-card takes a reply out of the story at once (undoable)                                                                                                                                                                                                                                                                                                                                                                                                                                  | pause; the GM agent honouring them in narration (A20)                                                                                                                                                                                                                                                                                                                   |
| A27 (part)                         | Models by role: each model serves roles (character replies, the GM, summaries, translation), and every request goes to the model serving its role                                                                                                                                                                                                                                                                                                                                                                                                            | pools of servers and parallel fan-out (framework, card 253); the model status page (A28)                                                                                                                                                                                                                                                                                |
| A28 (part)                         | Model status: each model's roles, and a check of whether its server answers, how fast, and whether it offers the model                                                                                                                                                                                                                                                                                                                                                                                                                                       | load and failure history across pools (framework)                                                                                                                                                                                                                                                                                                                       |
| A29                                | Text to speech per character voice; speech to text input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A30                                | Image generation for scenes and portraits (ComfyUI and others through the framework)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A31                                | Backgrounds per chat or per wiki location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| **Automation**                     |
| A30                                | Pictures of the scene: a model set to draw (the Pictures role; a chat model is never asked) draws the last story turns or the person's words; the picture is kept in the chat as a system line, out of the story; a character's portrait (Draw a portrait, no chat needed) and a chat's background (Draw a background: the scenario's place, else the last story turns), each from the person's words if given; the size each model draws at, chosen per endpoint                                                                                            | ComfyUI and other non-OpenAI image APIs (framework providers)                                                                                                                                                                                                                                                                                                           |
| A32                                | Quick replies and macros (a safe, declarative subset in place of STscript)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A33                                | Regex transforms on input and output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| **Accounts**                       |
| A34                                | Multi-player tables: invite players, each with their own PC and whispers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ours                                                                                                                                                                                                                                                                                                                                                                    | –                       | ✓    |
| A35                                | Plans and AI quotas (framework `entitlements`, `AIQuota`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                       | –                       | ✓    |
| A36                                | Installable app; works on a phone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SillyTavern (web)                                                                                                                                                                                                                                                                                                                                                       | ✓                       | ✓    |
| **Parity additions**               |
| A37                                | STscript: the full slash-command language (variables, conditionals, loops, closures, `/sendas`, `/gen`, `/inject`, …), run by a sandboxed interpreter                                                                                                                                                                                                                                                                                                                                                                                                        | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A38                                | Quick Replies sets bound to buttons, with auto-run triggers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A39                                | Extensions: built-ins that can be enabled or disabled, plus third-party extensions. Built on the framework's own extension system (the operator, 2026-11-20): each optional feature (Code Runner, web search, server voices, pictures, STscript) is a framework extension, a server extension (EXT, manifest) with a client extension gated by `GET /v1/extension` (`useCapabilities`); an install turns them on or off through its extension list, and a third party ships a framework extension. No extension system or URL-loaded sandbox of rpg-ai's own | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A40                                | Extensions and assets browser (characters, backgrounds, themes, ambient audio): the extensions are those the framework reports                                                                                                                                                                                                                                                                                                                                                                                                                               | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A37 (part)                         | Slash commands, the safe subset: /sys, /sendas, /narrate, /continue, /impersonate, /xcard, /pause, /resume, /help (beside /ic, /ooc, /gm); STscript run by an interpreter (never eval) with a step limit: pipes and {{pipe}}, chat and global variables, /if (with else), /while, /times, closures kept and /run, /echo, /abort                                                                                                                                                                                                                              | /gen, /genraw and /inject (a server generation mode), /hide (gap 10), and the rest of SillyTavern's commands, ranked in the audit. Done: /send, /trigger, /messages, /addswipe and /swipes-add, /swipes-count, /swipes-swipe, /del (`features/chat/scriptMessages.ts`); the chat's variables kept with the chat (`chat.variables`, shared with the prompt's {{getvar}}) |
| A41                                | Data Bank: documents attached to a chat, a character or globally, retrieved by meaning (built-in RAG)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A42                                | Web search injected into context; the search source is set per install, as model endpoints are (SearXNG or a search API) (the operator, 2026-11-20)                                                                                                                                                                                                                                                                                                                                                                                                          | SillyTavern (extension)                                                                                                                                                                                                                                                                                                                                                 | ✓                       | ✓    |
| A41                                | Data bank: documents for every chat, one chat or one character, found by the words the story uses                                                                                                                                                                                                                                                                                                                                                                                                                                                            | recall by meaning (embeddings, SaaS)                                                                                                                                                                                                                                                                                                                                    |
| A43                                | Chat translation: auto-translate input and output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SillyTavern (extension)                                                                                                                                                                                                                                                                                                                                                 | ✓                       | ✓    |
| A44                                | Image captioning and multimodal input (send an image; a vision model describes or reads it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A44                                | Pictures sent with a line; a vision model reads the newest line's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | captioning for text-only models                                                                                                                                                                                                                                                                                                                                         |
| A45                                | Reasoning display: show or hide a model's thinking blocks; reasoning templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A46                                | Function and tool calling for models that support it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A47                                | Text-completion and chat-completion modes; tokenizer choice; logit bias; CFG / negative prompts                                                                                                                                                                                                                                                                                                                                                                                                                                                              | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A48                                | AI Horde as a backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A49                                | UI customisation: themes, custom CSS, layout modes (bubble, document, VN), font scale, avatar style                                                                                                                                                                                                                                                                                                                                                                                                                                                          | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A50                                | Multi-user accounts on one install, with per-user data and an admin. Lite: local accounts in @zephyrex/lite (`accountsOwner`, `accountRoutes`: a name and a scrypt-hashed password, a signed session cookie, the first account the admin), shared with vtt's V30 (the operator, 2026-11-20)                                                                                                                                                                                                                                                                  | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A53                                | Objectives: the first not done is the character's current task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the model ticking tasks off itself                                                                                                                                                                                                                                                                                                                                      |
| A63–A66                            | The campaign's resolution mode in every prompt and in view in the chat's header                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | rules-as-written resolution through the VTT                                                                                                                                                                                                                                                                                                                             |
| A57, A58                           | Campaign frames (premise, genre, tone dials, themes, pillars, structure, truths, characters, resolution) read every turn by a chat in the campaign; the brief for players; session zero, one question a screen, ending on the frame as the players' brief (AP1)                                                                                                                                                                                                                                                                                              | lines and veils pooled anonymously in session zero; the GM proposing the frame; linking a wiki campaign                                                                                                                                                                                                                                                                 |
| A59–A61                            | Scenarios as moving parts (cast, places, clocks, secrets with clues, beats, endings); a chat runs one and the model reads the GM's view every turn; play state at the table; files in and out                                                                                                                                                                                                                                                                                                                                                                | the GM's abilities moving the state itself (decide); drafting a scenario by model or from the wiki; rehearsal (A62, SaaS)                                                                                                                                                                                                                                               |
| A51                                | Character tags, folders and favourites; welcome screen with recents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A52                                | Group greetings; `/sendas` a group member; group member muting and join modes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| A53                                | Objectives and tasks for a character, tracked across a chat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SillyTavern (extension)                                                                                                                                                                                                                                                                                                                                                 | ✓                       | ✓    |
| A54                                | Animated avatars: Live2D and talking-head extensions. Live2D only as an optional add-on: the person installing supplies the Cubism SDK, kept outside rpg-ai's own code, after the operator's licence review; talking heads first (the operator, 2026-11-20)                                                                                                                                                                                                                                                                                                  | SillyTavern (extension) _(verify)_                                                                                                                                                                                                                                                                                                                                      | ✓                       | ✓    |
| A55                                | Code blocks that run JavaScript or STscript (Code Runner), sandboxed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SillyTavern (extension)                                                                                                                                                                                                                                                                                                                                                 | ✓                       | ✓    |
| A56                                | Backups and chat exports (JSONL, text)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | SillyTavern                                                                                                                                                                                                                                                                                                                                                             | ✓                       | ✓    |
| **Campaigns, scenarios and modes** |
| A57                                | Campaign frame: premise, genre and tone, themes, pillars, structure, pacing, setting truths, content boundaries, ties between characters; a session-zero flow that fills it in with the players                                                                                                                                                                                                                                                                                                                                                              | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A58                                | Campaign brief: the frame as a page the players read, without the GM's secrets                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A59                                | Scenarios: premise, hook, stakes, situation, cast with agendas and secrets, places, clocks, clues, beats, and outcomes                                                                                                                                                                                                                                                                                                                                                                                                                                       | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A60                                | Scenario state in play: clocks advance, clues are found, beats are hit, NPCs move on their agendas; the GM reads it every turn                                                                                                                                                                                                                                                                                                                                                                                                                               | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A61                                | Draft a scenario from a prompt or from the world, then edit it; import and export as JSON                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A62                                | Rehearse a scenario: AI players play it through in the background, and a report flags unreachable clues, dead ends, pacing and difficulty                                                                                                                                                                                                                                                                                                                                                                                                                    | ours                                                                                                                                                                                                                                                                                                                                                                    | –                       | ✓    |
| A63                                | Narrative mode: fiction first; the GM resolves by the story, rolls only at real stakes and uncertainty, in a light dice style if the frame names one                                                                                                                                                                                                                                                                                                                                                                                                         | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A64                                | Mechanical mode: rules as written; every action the rules cover is resolved by the VTT's rules, only legal actions are offered, and results are never overridden by the narrator                                                                                                                                                                                                                                                                                                                                                                             | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓ (with the VTT loaded) | ✓    |
| A65                                | Hybrid: a mode per kind of scene (e.g. combat mechanical, talk narrative), and a per-scene switch the table can call for out of character                                                                                                                                                                                                                                                                                                                                                                                                                    | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |
| A66                                | The mode in force shown at all times, and every resolution labelled by how it was decided (rules, roll, decision model, narrator)                                                                                                                                                                                                                                                                                                                                                                                                                            | ours                                                                                                                                                                                                                                                                                                                                                                    | ✓                       | ✓    |

Third-party extensions (A39) and code runners (A37, A55) run third-party code. They run
only in a sandbox with declared permissions (an iframe or worker with a message API, and
server-side through the same sandbox as the VTT's scripts), never with the app's or the
server's own rights. The sandbox design is a security-review item before these ship.

## Out-of-character (OOC)

A table always has two conversations: the story, and the people around the table talking
about the story. SillyTavern has only the first, and players fake the second with `(( ))`,
which then pollutes the story context.

**Channels.** Every message carries a `channel`:

| Channel  | Who sees it                                       | Goes into the story context?             |
| -------- | ------------------------------------------------- | ---------------------------------------- |
| `ic`     | the table                                         | yes                                      |
| `ooc`    | the table                                         | no; into the table-talk context          |
| `gm`     | the sender and the GM agent (a whisper to the GM) | no; into the table-talk context, private |
| `roll`   | the table, or GM-only for a blind roll            | its result, as a mechanical fact         |
| `system` | the table                                         | as the system message says               |

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
reads them every turn. The players see them in a _Table_ drawer and can edit them by
consensus (the GM proposes, and a player confirms).

**Detection.** The composer has an explicit IC/OOC switch, and `/ooc`, `((`, `//` switch it
for one message. An unmarked message is classified by the `message_intent` decision
(below). A low-confidence result asks the sender with a one-tap chip ("Was that in
character?") rather than guessing.

**UI.** OOC messages sit in a separate visual lane: indented, a muted surface, the sender's
real name rather than their character's, a smaller face. The story column can hide them
(_Story only_), and exports and session reports leave them out by default.

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

**Roles.** Each job belongs to a _model role_. A campaign maps each role to a pool:

| Role                  | Job                                                  | Typical size                            |
| --------------------- | ---------------------------------------------------- | --------------------------------------- |
| `narrator`            | the GM's story voice and the table GM                | the largest model available             |
| `npc`                 | major NPCs' lines and in-character choices           | mid-size, one call per NPC, in parallel |
| `decision`            | typed decisions (below)                              | small decision models                   |
| `summarizer`          | rolling scene and session summaries, session reports | mid-size, off the critical path         |
| `embedder`            | memory recall, lore similarity                       | an embedding model                      |
| `tts`, `stt`, `image` | voices, dictation, art                               | as the framework's providers offer      |

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
- **It lacks parallel dispatch.** A framework _rotation_ is ordered failover: it "will try
  each instance in order until one succeeds" (`RotationModel`). Load-aware concurrent
  dispatch across instances is a generic capability. It belongs in the framework's provider
  layer as a pool mode beside rotation, raised on card 253, and this product uses it rather
  than building its own.

**Where the self-hosted servers are.** The self-hosted model servers and their tiers are
the Self Hosted AI session's area (AI Lab card 182, SOP _AI Environment_). Which servers
serve which roles, and where the decision models run, is decided there with the operator.
The app only takes provider instances as configuration.

## Decision models (Jev-style)

Per the SOP, a decision model emits a **typed decision**: a choice from a fixed set, a
calibrated score or an explicit **null**, in one forward pass. It is a System-1 layer in
front of the LLM, judged on calibration and on abstaining correctly. The LLM is the
System-2 fallback for every null.

**The decision kinds this product uses:**

| Kind                | Options                                                  | Used for                                      |
| ------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `message_intent`    | `ic_speech`, `ic_action`, `ooc`, `command`, `gm_whisper` | routing a message (OOC detection)             |
| `needs_roll`        | `none` or a stat/skill from the system pack              | whether an action calls for a check           |
| `combat_action`     | the VTT's `legal_actions(combatant)`                     | what an NPC does on its turn                  |
| `target_select`     | the legal targets                                        | whom it does it to                            |
| `morale`            | `fight`, `fall_back`, `flee`, `surrender`, `parley`      | when NPCs break                               |
| `disposition_shift` | −2 … +2                                                  | how an NPC's attitude moves after an exchange |
| `next_speaker`      | the characters present                                   | group-chat and scene turn-taking              |
| `lore_relevance`    | score per candidate entry                                | gating lorebook inclusion beyond keywords     |
| `expression`        | the character's sprite set                               | the portrait to show                          |

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

The records feed the calibration review, are where the _why_ panel reads from, and are what
a threshold is tuned against.

**The why panel.** On any NPC action in the transcript, _Why?_ opens:

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

## Campaign framing

A campaign starts as an agreement about what kind of game it is. The frame records that
agreement. The GM reads it on every turn, and the players read it as the campaign brief.

The frame is its own resource, `/v1/campaign_frame` (`CampaignFrameModel`, table `campaign_frames`;
lite: Prisma `CampaignFrame`), not `/v1/campaign`: the campaign itself, with its world, is the
wiki's `rpg_core` CampaignModel, and both load in one app under the suite's layout (renamed
2026-11-21). A frame links to its wiki campaign by `wiki_campaign_id`; chats and scenarios keep
their `campaign_id`, which names the frame.

**What the frame holds** (`ai_campaign.CampaignFrameModel`, one per campaign):

| Part               | What it says                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Premise and pitch  | the one-paragraph promise of the campaign                                                                                           |
| Genre and tone     | the genre, and positions on a few dials: grim to hopeful, serious to comic, grounded to fantastic, slow-burn to pulpy               |
| Themes             | what the story is about (loyalty, the cost of power), so the GM can lean on them                                                    |
| Pillars            | the weight of combat, exploration, social play and mystery, which steers what scenes the GM offers                                  |
| Structure          | sandbox, linear, episodic or one-shot; how long a session runs; how a session ends (a cliffhanger, a breather)                      |
| Setting truths     | the facts the table agrees on before play ("magic is feared", "the empire fell last winter"), drawn from the wiki when it is loaded |
| Content boundaries | the content rating, lines and veils (from the safety tools, under OOC), and what the X-card skips                                   |
| The characters     | each player character's ties to the others and to the setting, and what each player wants from the game                             |
| Resolution         | the default [mode](#narrative-and-mechanical-modes), and the game system when the mode is mechanical                                |
| GM style           | a link to the GM profile (`ai_gm.GMProfileModel`): voice, verbosity, difficulty                                                     |

**Session zero** (A57) is a guided flow, usable by one person or the whole table:

- The GM agent asks the questions above, one screen each, with tap-to-pick answers and a
  free-text box for each.
- It proposes a frame, and the table edits and accepts it.
- Lines and veils are collected privately and pooled anonymously, so nobody is put on the
  spot.

**The brief** (A58) is the frame rendered for players: premise, tone, truths, characters and
boundaries. It never carries the GM's secrets, and in the SaaS edition it is shareable by link.

**What the frame changes in play:**

- It is a context section of its own (below), above the characters.
- The pillars and structure feed the GM's scene choices.
- The boundaries are enforced on every turn.
- The resolution mode decides which tools the GM may use.

**Ownership.** The frame belongs to this product. Campaigns themselves belong to the wiki
([SUITE.md](SUITE.md)). With the wiki loaded, a frame links to its wiki campaign and reads the
setting truths from it. Without the wiki, the frame stands alone, so a lite install with only
this product still frames a campaign.

## Scenario modeling

A scenario is a playable situation the GM runs: a mystery, a heist, a siege, a court
intrigue. It is written as a model of moving parts, not as a script, so play can go anywhere
and the GM still knows what is true and what happens next.

**The model** (`ai_campaign.ScenarioModel` and its parts):

| Part                  | What it is                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premise, hook, stakes | what is going on, how the characters get pulled in, what is lost if nobody acts                                                                                                             |
| Situation             | the state of things when play starts                                                                                                                                                        |
| Cast                  | each NPC's agenda (what they want and will do unprompted), secrets, disposition, and what they know. Links to wiki people and AI characters                                                 |
| Places                | where things happen; links to wiki locations and VTT scenes                                                                                                                                 |
| Clocks                | progress tracks of n segments: "the cult completes the ritual", "the guard notices". Each says what advances it (time passing, a failed roll, a named event) and what happens when it fills |
| Secrets and clues     | each truth the characters can learn, with several clues pointing to it from different places (a dead end on one clue is not a dead end on the truth)                                        |
| Beats                 | optional moments, ordered or conditional ("when the bridge is crossed"). Guidance for the GM, never rails                                                                                   |
| Encounters            | set pieces, with VTT encounters attached when the VTT is loaded                                                                                                                             |
| Outcomes              | how it can end, and what each ending writes back to the campaign and the wiki                                                                                                               |

**State in play** (`ai_campaign.ScenarioRunModel`, one per play session that runs the
scenario):

- the clock values, the clues found and by whom, the beats hit, and each NPC's current
  disposition and whereabouts;
- changed only through the GM's abilities (`advance_clock`, `reveal_clue`, `mark_beat`,
  `move_npc`, `end_scenario`), each recorded with the turn that did it;
- a context section of its own every turn: what is true now, which clocks are close to
  filling, which clues are still unfound, and which NPC agendas would move next;
- shown in the GM view; players see only what their characters have found.

**Making scenarios** (A61):

- written by hand in the scenario editor;
- drafted by the GM from a prompt, or from the world when the wiki is loaded (its plots,
  quests, factions and places), then edited;
- imported and exported as JSON.

**Rehearsing** (A62, SaaS), which is the modeling half of _scenario modeling_:

- A rehearsal runs the scenario with AI players on background model pools, several times
  and with different party styles (cautious, reckless, social).
- Each run is a transcript plus the scenario state's history.
- The report shows:
  - clues nobody found, and secrets that became unreachable;
  - clocks that filled too early or never moved;
  - beats never reached, and encounters too easy or too hard by the VTT's numbers;
  - how long the scenario took in turns.
- The author fixes the scenario and rehearses again. Rehearsals run on the pools' spare
  capacity at low priority, never in front of a live table.

## Narrative and mechanical modes

How an action's outcome is decided is a mode, set in the campaign frame and switchable per
scene.

|                        | Narrative                                                                                                                                 | Mechanical                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Who decides an outcome | the GM, from the fiction and the frame                                                                                                    | the game system's rules, through the VTT                                                 |
| When dice are rolled   | only when the outcome is uncertain and the stakes matter; the `needs_roll` decision runs with a high bar                                  | whenever the rules call for a check; `needs_roll` picks the check, never whether to roll |
| Dice style             | the frame's light style (e.g. 2d6 with full success, partial and miss), rolled by the VTT when it is loaded and by this product otherwise | the system pack's checks, rolled by the VTT                                              |
| What an NPC may do     | anything the fiction allows; decision models steer pacing and disposition                                                                 | only `legal_actions` from the VTT; decision models choose among them (combat kinds)      |
| Combat                 | narrated exchanges, no turn order unless the GM calls for one                                                                             | the VTT's initiative, turns, movement and cover, strictly                                |
| State                  | the scenario's clocks and the story                                                                                                       | the sheets, conditions and positions on the VTT, plus the scenario                       |
| Narrator's freedom     | describes and decides                                                                                                                     | describes the resolved facts only. It never invents a result and never overrides a roll  |
| Without the VTT        | works fully                                                                                                                               | not offered (A64 needs the VTT's rules)                                                  |

**Hybrid** (A65): the frame maps each kind of scene to a mode, e.g. combat → mechanical,
social and exploration → narrative.

- The GM classifies the current scene (a decision kind, `scene_kind`) and applies its mode.
- The table can switch the mode for a scene from the OOC lane ("let's play this fight
  loose"). The table GM records the switch as a table note for that scene.

**What a mode changes in the machinery:**

- **Tools:** in mechanical mode the GM's resolution tools are the VTT's (`roll`,
  `legal_actions`, `apply_action`). In narrative mode, `resolve_narratively` records an
  outcome with its reason, and `light_roll` is allowed.
- **Prompt:** a resolution section states the mode in force and its rules ("you may not
  decide outcomes the rules cover; describe the result given").
- **Decision kinds:** combat kinds run only in mechanical mode. `scene_kind` and `needs_roll`
  run in both, with mode-specific thresholds.
- **Records:** every resolution is labelled with how it was decided (rules, roll, decision
  model or narrator) and shown that way in the why panel (A66).

**In the UI:**

- The top bar shows the mode in force (_Narrative_, _Mechanical_ or _Hybrid: mechanical
  now_).
- Roll cards appear for every roll in either mode.
- In mechanical mode the composer's _Do_ offers the character's legal actions as chips,
  thumb-sized on a phone.

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
2. the campaign frame: premise, tone, themes, pillars, truths, boundaries;
3. the resolution mode in force and its rules;
4. table notes (house rules, lines and veils, scene mode switches);
5. the character cards present;
6. the scenario's state: what is true now, the clocks near filling, unfound clues, NPC
   agendas;
7. the scene: the location entity, who is present, and what is perceivable from
   `scene_snapshot`;
8. mechanical state: the sheets and the encounter, as a structured block (mechanical mode,
   or whenever the VTT holds a scene);
9. lore: gated lorebook entries;
10. memory: rolling summary and recalled memories;
11. recent transcript (`ic` only);
12. author's note;
13. the turn's resolved facts (rolls, decisions, narrative resolutions), each labelled by how
    it was decided.

The context inspector (A18) shows exactly this per turn.

## Screens

| Path                                         | What it is                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                          | Landing: hero with a live sample scene, the OOC lane and the why panel visible; SillyTavern comparison; pricing; FAQ.                                     |
| `/scenarios`, `/scenarios/[id]`              | Scenarios (the framings: Solenne, Dunmarch): each one's brief, cast, lore and prep, and its campaigns. _Start a campaign_ picks the party.                |
| `/campaigns/[id]`                            | A campaign: its party, its sessions (newest first, each with its summary), rewind and fork. _Play_ opens the current session.                             |
| `/campaigns/[id]/sessions/[sid]`             | **The play surface** (below), for one session; the seat picker is in its top bar.                                                                         |
| `/sandbox`                                   | One-on-one and group roleplay (SillyTavern's chats), at the bottom of the navigation.                                                                     |
| `/characters`, `/characters/[id]`            | Card gallery; card editor with every V2/V3 field, greetings, examples, sprites, voice, and "link to a wiki person".                                       |
| `/personas`                                  | Your personas.                                                                                                                                            |
| `/lorebooks`, `/lorebooks/[id]`              | Lorebook list and entry editor (the full field surface), with "generate from the world".                                                                  |
| `/campaigns`, `/campaigns/[id]`              | Campaigns, and one campaign's home: its frame, scenarios, sessions and brief.                                                                             |
| `/campaigns/[id]/frame`                      | The frame editor, and _Session zero_: a guided flow, one question a screen on a phone.                                                                    |
| `/campaigns/[id]/brief`                      | The players' brief (shareable by link in SaaS).                                                                                                           |
| `/campaigns/[id]/scenarios/[sid]`            | The scenario editor: cast, places, clocks, clues, beats, encounters, outcomes, with _Draft from a prompt_, _Draft from the world_ and _Rehearse_.         |
| `/campaigns/[id]/scenarios/[sid]/rehearsals` | Rehearsal reports (SaaS).                                                                                                                                 |
| `/campaigns/[id]/gm`                         | The GM: style, difficulty, content rating, the resolution mode and per-scene-kind modes, table notes, model roles for this campaign, decision thresholds. |
| `/models`                                    | Providers, pools, instances, role mapping, live status (A28).                                                                                             |
| `/presets`                                   | Sampler presets, instruct and context templates.                                                                                                          |
| `/settings`                                  | Theme, text size, reduced motion, contrast, TTS voice, keybindings, OOC display.                                                                          |

### The play surface

- **Centre:** the conversation column.
  - Messages carry portraits and expression sprites, speaker names and a world date and
    time from the wiki calendar.
  - Swipe arrows and branch markers.
  - The OOC lane, set visually apart.
  - Roll cards inline, with dice, formula and the "why" of modifiers.
  - _Why?_ on NPC actions.
- **Composer:**
  - the IC/OOC switch;
  - a _Say_/_Do_ switch for IC;
  - a roll button with the sheet's stats;
  - impersonate, continue, regenerate;
  - an X-card button, always visible and never more than one tap.
- **Left drawer, World:** the current location's entity card, the NPCs present, active
  quests, and lore cards for anything mentioned. A hover on any `@` name shows its wiki
  preview card.
- **GM view** (the person running a scenario, or watching the AI GM run it): the scenario's
  clocks as segmented rings, unfound clues, NPC agendas, and the mode switch.
- **Right drawer, Table:**
  - a live mini-map of the VTT scene (read-only here; _Open table_ goes to the VTT);
  - the combat HUD (initiative, turn, HP bars);
  - your sheet;
  - table notes.
- **Seat picker** (top bar): the GM or any character; changing it takes effect on the next turn.
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
- **`ai_campaign`** [NEW]:
  - `CampaignFrameModel`: as under Campaign framing. It holds the resolution mode, the
    per-scene-kind modes and the light dice style, and optionally links to the wiki campaign.
  - `ScenarioModel` and its parts: `ScenarioCastMemberModel`, `ScenarioPlaceModel`,
    `ScenarioClockModel`, `ScenarioSecretModel` (with its clues), `ScenarioBeatModel`,
    `ScenarioEncounterModel`, `ScenarioOutcomeModel`.
  - `ScenarioRunModel` and `ScenarioRunEventModel`: the state in play and every change to
    it, with the turn that made it.
  - `RehearsalModel`: a rehearsal's settings, runs and report (SaaS).
  - Limits, enums (modes, clock triggers, scene kinds) and rule cases go in `contract/`, as
    the prompt cases do.
- **Adapters:** SillyTavern card PNG/JSON (V2/V3), lorebook JSON, chat JSONL; import and
  export.

**Framework reuse:** `ai`, `ai_agents`, `ai_chains` (quick-reply macros), `ai_prompts`
(templates), `ai_memories`, `conversations`, `media`, `entitlements`.

**Framework gaps raised on card 253**, all generic:

1. a pool dispatch mode;
2. a `decide` provider capability;
3. ~~multi-user room sync with per-recipient filtering~~: not a gap, and not this product's.
   Multiplayer tables are the VTT's ("the table: … live multi-player play", SUITE.md; the
   operator, 2026-11-20: "Shouldn't seats be in vtt and campaigns be in either wiki or vtt?"),
   built on the framework's `conversations` ("Should be in the conversations extension
   already"):
   - **the members are characters, not users** (the operator): the VTT seats a table's
     characters in a framework conversation, a PC's seat naming its player and an NPC's seat
     naming no one, as `ai_agents` seats agents;
   - **a whisper is a two-character conversation** ("Wouldn't whispers just be dms"), kept per
     table, merged into the table's feed, and the host sees every whisper at their table (the
     operator: "Host sees all whispers");
   - **live:** the conversation's feed (`GET /v1/conversation/{id}/events`, `announce()`;
     server-framework, card 253).
     **This product's A34** is the AI GM at the VTT's table: it reads the seats, voices the NPC
     seats, reads an NPC's whispers with a PC (never another pair's), and appears when
     `GET /v1/extension` lists the VTT's table extension. Alone, this product is single-player,
     as SillyTavern is. AP7 (spotlight balance) reads the characters' turns at that table.

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

## Progress (2026-11-20)

Built in both editions (lite and SaaS), each with unit tests, a story with a play test per
component, and twin implementations held to shared case files where the server must agree. Nothing
here has had its full gate run yet: full runs wait for a release candidate.

| Row                         | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Not yet                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play model (2026-11-21)     | Scenarios (frames, at /campaigns), campaigns (a chat with a CampaignPlay state, at /play), sessions (ChatSession: a segment from a start message; End session writes the summary, marks 'Session n', opens the next; replies read only the current session, earlier ones by summary: `features/chat/play.ts` / `ai_chat/Play.py`, contract/play-cases.json), the hot-swappable seat (SeatPicker: the GM or any character; the played character is the person and leaves the AI cast), Rewind to here and Fork a new campaign from here; one-on-one chats at /sandbox (b3fd41b). The GM's prep records (A59, A61) are "prep sheets" at /scenarios, listed under a scenario's _Prep_, so no two things share the name "scenario" until the routes move to the table above. Live-tested end to end against the lab's models (campaign.live.spec.ts, 2026-11-21)                                                                                                                                                             | settings and systems (wiki S6, vtt GameSystem.setting_id are built, unpushed); a campaign's system choice and DH2e tests through vtt's `test` ability                                                                                                                                                                                                                                                                                                      |
| Canon warnings (2026-11-21) | POST /v1/canon_check in both editions: the decide model scores a line against the canon in reach (lore it names, the frame's truths, earlier sessions); `features/chat/canon.ts` / `ai_chat/Canon.py` (contract/canon-cases.json) give yellow or red with the fact quoted; on the composer while writing and on AI lines once written (b3fd41b)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | reading the setting's canon from the wiki (S6's `setting_canon`), canon_level (operator's call)                                                                                                                                                                                                                                                                                                                                                            |
| A46 (part)                  | Tool calling as a twin held to contract/tool-cases.json (`features/chat/toolCalls.ts`, `ai_chat/ToolCalls.py`): a streamed reply's tool_calls put together by index, each checked against the tools offered (a name not offered or arguments that aren't a JSON object are refused and never run), and the follow-up turn. The tools offered are every one this install has (web search when a source is set, pictures, lore lookup, dice through the VTT when it is loaded), each switchable off per chat (the operator, 2026-11-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | running the calls inside a reply (generate and the BLL, after A19), the per-chat tool switches                                                                                                                                                                                                                                                                                                                                                             |
| A24 (part)                  | Session reports into the wiki, as a journal (world_narrative's JournalModel, kind session_report, OBJECT_PLAN; wiki S3), written through rpg_core's `session_report` ability with its mentions as entity references: what happened, who was met, what changed. Who saves it depends on who runs the game (the operator, 2026-11-20: "For vtt / wiki, yes. For ai-RPG, it's all automated."): at a human GM's table (VTT or wiki) the AI drafts it and the GM reviews and saves it; when the AI GM runs the game, the report is written to the log automatically when the session ends ; the drafter's prompt (story lines only, the last 400) and the mentions it links are a twin held to contract/report-cases.json (`features/campaign/sessionReport.ts`, `ai_campaign/SessionReport.py`)                                                                                                                                                                                                                             | the review sheet for a human GM. Done: "End session" in the chat's menu (`POST /v1/session_end`, ai_chat/BLL_AI_SessionEnd.py) writes the report through the wiki's `session_report` into the linked wiki campaign, naming the entities from `world_entities` (the operator, 2026-11-21: only a button)                                                                                                                                                    |
| AP7 (part)                  | Spotlight balance as a twin held to contract/spotlight-cases.json (`features/campaign/spotlight.ts`, `ai_campaign/Spotlight.py`): over the table's last 30 story lines, a PC with under 60% of an even share of the players' lines, or none, is quiet; the two quietest are named in one line the AI GM reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | reading the VTT table's lines (rpg_table, `loaded_ability`) and putting the line in the GM's prompt                                                                                                                                                                                                                                                                                                                                                        |
| A31 (decided)               | Backgrounds follow the scene (the operator, 2026-11-20: "Follows the scene"): in a chat whose campaign is linked to the wiki, when the story moves to a wiki location with a picture, the background switches to it, as an expression sprite follows a line. The scene's location is the VTT scene's when the VTT is loaded, otherwise the wiki location the story's latest lines name; a background set by hand on the chat always wins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | the location picture in the wiki's world_entities; the scene-location twin; the switch in ChatView                                                                                                                                                                                                                                                                                                                                                         |
| A15 (part)                  | The relevance gate runs only when the keyword-matched entries don't fit the lore budget: a decision model then picks which to keep, from those entries only, kept in its order until the budget is full; with room for all, no model call (the operator, 2026-11-20: "When too many match"). The gate's arithmetic is a twin held to contract/lore-gate-cases.json (`features/lore/loreGate.ts`, `ai_lorebook/LoreGate.py`). The sync's decisions as a twin held to contract/wiki-sync-cases.json (`features/lore/wikiSync.ts`, `ai_lorebook/WikiSync.py`): one entry per wiki entity, linked by `wiki_entity_id`, keys from its name and aliases, content its summary, removed by its tombstone, the person's own entries never touched. It reads the wiki's `world_entities` (wiki S2b): a since-cursor page under the caller's access. A linked book pulls the changes since its last pull before each reply in a chat that uses it, at most once a minute, plus a "Sync from wiki" button (the operator, 2026-11-20) | the pull before each reply (generate, after AP8), linking a book to a wiki campaign from the UI (the CampaignFrame rename has freed `/v1/campaign` for the wiki's), and the decision-model gate on relevance. Done: the `wiki_entity_id` and `wiki_campaign_id` columns in both editions, `POST /v1/lorebook/sync` (LorebookSync_test), and the "Sync from wiki" control on a linked book, shown when the world is loaded (`components/lore/WikiSync.tsx`) |
| A1, A2                      | Cards V1/V2/V3 in (JSON, PNG), several at once; out as PNG with the lorebook inside, or JSON, one or every card shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | import from a URL (Chub and others); duplicating a character; the Character's Note (depth prompt) and talkativeness, kept on import but unused (audit gap 7)                                                                                                                                                                                                                                                                                               |
| A3                          | Personas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | locking to a character; the description's position; a persona lorebook; a title; turning a character into a persona (audit gap 9)                                                                                                                                                                                                                                                                                                                          |
| A6                          | Streaming, stop, regenerate, continue, impersonate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | auto-swipe and auto-continue; start reply with (prefill); token probabilities                                                                                                                                                                                                                                                                                                                                                                              |
| A7–A9                       | Swipes, branches (with a view of every branch), edit, delete, bookmarks; moving a message up or down its branch (server: the framework's update_trusted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | hiding a message from the prompt (audit gap 10); copy; deleting several at once; named checkpoints; editing a message's speaker or role                                                                                                                                                                                                                                                                                                                    |
| A10, A52                    | Group chats: turn order, natural order (a member the last story line names speaks next), pick who speaks next, members left out of turns, group greetings in turn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | natural order by a decision model (natural order by who is named is in); swap or join cards, auto-mode, self responses, pooled order, a group's scenario override, the group nudge (audit gap 6)                                                                                                                                                                                                                                                           |
| A11                         | OOC channels kept out of the story; table notes (house rules, pacing, tone, reminders) in every prompt; the table GM proposes a note as its answer's last line, which a player adds or leaves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A20                         | The GM's two voices: the narrator tells what happens next in the story (every character in brief, its own narration as its voice); the table GM answers `gm` questions out of character; pause; the campaign's GM style, read by the GM's voices only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | the GM taking turns on its own                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AP2                         | Previously…: the rolling summary at the top of a chat when a session starts, read aloud where the browser can speak, hidden on request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | written from the last session report too (A24, VTT)                                                                                                                                                                                                                                                                                                                                                                                                        |
| AP9                         | Names without lore: names the story keeps using that no character, persona or lore entry covers, each a tap from a stub entry in a chosen lorebook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a stub drafted by a model; wiki pages (A15)                                                                                                                                                                                                                                                                                                                                                                                                                |
| AP5                         | Each reply written while the chat is open says about how many tokens it came to and how long it took                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | cost for hosted APIs (a price per endpoint); kept across visits                                                                                                                                                                                                                                                                                                                                                                                            |
| AP4                         | Again with another model: a reply's alternative asked of another of the person's models, kept as a swipe beside the first to compare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | the same turn sent to two at once                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A48                         | AI Horde as a backend: an endpoint whose API is AI Horde is asked as a job (submitted, then polled) and answers as any reply does, in both editions; anonymous without a key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | the Horde's worker and model list in the model check                                                                                                                                                                                                                                                                                                                                                                                                       |
| A12                         | Chat library: search by title, cast, tag or the words of any message (opening the chat there); folders and tags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | a welcome screen of recent chats; temporary chats                                                                                                                                                                                                                                                                                                                                                                                                          |
| A13, A56                    | SillyTavern chat import; branch export as JSONL or text; a backup of everything as one file, restored beside what is there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A14                         | World Info, the full entry surface and activation; ST import and export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | persona lorebooks, insertion strategy, outlets, group scoring, automation IDs, tag filters, triggers, extra matching sources, vector matching, include names, min activations and max depth, a budget as a percent of context, the overflow alert                                                                                                                                                                                                          |
| A16                         | Author's note, a chat's own system prompt, the prompt manager (order, on/off, budgets)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | the prompt manager's own prompts (role, position, depth, triggers) and utility prompts; the author's note's frequency, position and role (audit gap 3)                                                                                                                                                                                                                                                                                                     |
| A17                         | Instruct templates for text-completion endpoints (ChatML, Llama 3, Alpaca, Mistral), and a person's own (on the Models page), picked per endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | context templates (story string), include names, activation regex, reading SillyTavern instruct and context files in (audit gap 4)                                                                                                                                                                                                                                                                                                                         |
| A18                         | Context inspector with token estimates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A19                         | Rolling summaries (asked of the chat's model, kept or edited); recall by meaning in both editions: a chat's older story lines embedded by a model set to embed (the embed role: any OpenAI-compatible `/embeddings`), the closest to the last lines entering the prompt's memories section within its budget (lite in SQLite, SaaS in the framework's `ai_memories`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A29                         | Read aloud per character voice, by a model set to speak (the Voices role: any OpenAI-compatible `/audio/speech`, each character naming its voice there) or else by the browser; dictation by the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | dictation by a speech-to-text model; TTS and STT providers beyond OpenAI-compatible                                                                                                                                                                                                                                                                                                                                                                        |
| A31                         | A picture behind each chat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | per wiki location                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A32, A38                    | Quick replies (send or fill, story or table talk); SillyTavern Quick Reply sets read in; running by themselves when a chat opens, after a send or after each reply (only on opening may one send: either twin refuses a loop)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | the macros beyond `{{char}}` and `{{user}}`, `<BOT>` and `<USER>` (audit gap 1); the `/qr-*` commands, the context menu, linked sets                                                                                                                                                                                                                                                                                                                       |
| A33                         | Regex scripts: stored, display-only, prompt-only, by depth; SillyTavern scripts read in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | regex presets; scripts scoped to a character                                                                                                                                                                                                                                                                                                                                                                                                               |
| A36                         | Installable; every screen works on a phone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A43                         | Translate a message by the translation model (else the chat's), for display; every new reply translated into the device's language when the device asks (Translate replies)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | translating what the person writes before it is sent; Google, DeepL and other translation providers                                                                                                                                                                                                                                                                                                                                                        |
| A45                         | Reasoning folded under Thinking, never read back to the model; reasoning a model streams apart (`reasoning_content`, `reasoning`) folded in as `<think>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | reasoning templates; adding reasoning by hand; asking for reasoning and its effort                                                                                                                                                                                                                                                                                                                                                                         |
| A47                         | Chat- and text-completion endpoints; logit bias and classifier-free guidance on presets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | tokenizer choice: the model server's own `/tokenize` where it has one, else the estimate (the operator, 2026-11-20); the samplers beyond temperature, top-P, top-K and repetition penalty (min-P, presence and frequency penalty, seed, typical-P, DRY, XTC, Mirostat and the rest), banned strings and sampler order (audit gap 2); native APIs (Claude, Gemini and Vertex, NovelAI) and connection profiles (audit gap 8)                                |
| A49                         | Layouts (flat, bubbles, document) and text size, per device; themes (the framework's light, dark and colour-blind pair) in Settings; the person's own CSS over the theme, per device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | theme colours by hand and theme import, avatar style, a visual-novel layout, notifications and sounds, LaTeX, timestamps, the UI's language                                                                                                                                                                                                                                                                                                                |
| A51                         | Character tags, folders (filter chips shared with the chat library), favourites, search                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | a choice of sort order; managing tags                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A55                         | Code Runner: fenced JavaScript in a message runs when asked, sandboxed (an opaque-origin frame with no network, in a worker ended after 3 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | STscript blocks (with A37)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AP10                        | A branch as a book: an EPUB of its in-character lines, with the pictures they carry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | generated scene images for lines without one                                                                                                                                                                                                                                                                                                                                                                                                               |
| AP8                         | A character's memory across chats, opt-in per character (Remember across chats, on the character page): its replies also recall the memories of the person's other chats it was cast in, never anyone else's, within the same budget and under their own label (`features/memory/across.ts`, `ai_chat/MemoryAcross.py`, held to contract/memory-across-cases.json). The character page puts the card first, then what only this app keeps (lorebook, voice, expressions, memory across chats), the folder last                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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
   - **Campaigns:** the frame, session zero and the brief (A57–A58).
   - **Scenarios:** the model, its editor, state in play, and drafting and import/export
     (A59–A61).
   - **Narrative mode** (A63) and the mode display (A66). Narrative play needs no VTT, so it
     comes first.
4. **Many models:**
   - roles, pools, the models page;
   - the per-turn parallel scheduler on the framework's pool mode;
   - NPC agents.
5. **Decisions and combat:**
   - the VTT's phase-1 mechanics as tools;
   - the decision kinds with records and the why panel;
   - calibration review;
   - group-chat turn-taking;
   - **mechanical and hybrid modes** (A64–A65), with legal-action chips in the composer;
   - **scenario rehearsal** (A62), once pools and AI players exist.
6. **Table:** the AI GM at the VTT's multiplayer table, the AI party mode, sprites and VN mode, TTS
   and STT, image generation.
7. **The remaining SillyTavern parity:**
   - STscript and Quick Replies;
   - the extension sandbox and the assets browser;
   - the Data Bank, web search, translation, captioning;
   - reasoning display, tool calling, completion modes, Horde;
   - themes and layout modes, multi-user installs, objectives, animated avatars, the code
     runner (A37–A56).

## Decisions for the operator

- **2026-11-21, play model:** scenarios (framings), campaigns (save states that rewind or fork, each with its own party), sessions (segments that compact and summarize); the seat hot-swaps to the GM or any character; one-on-one chats move to a sandbox section. See [The play model](#the-play-model-the-operator-2026-11-21).
- **2026-11-21, settings and systems:** settings (Warhammer 40,000, Age of Sigmar, Fantasy, D&D, Fallout, Modern…) enclose scenarios and campaigns; each has mechanical systems (for 40k: the FFG lines, Wrath & Glory, Imperium Maledictum) that define mechanics for mechanical games and are ignored for narrative ones. See [Settings and systems](#settings-and-systems-the-operator-2026-11-21).
- **2026-11-21, campaign pages on a phone** must be reworked (the operator: the campaign view on mobile is unacceptable).

These are architecture and placement, so they are asked, never defaulted. They are routed
through the Session 0 Manager:

1. The framework additions above (pool dispatch, `decide`, room sync) go in server-framework
   as generic capabilities.
2. Which servers serve which roles, and where the decision models are enrolled (Self Hosted
   AI, card 182).
3. Lite scope: whether lite includes the GM campaign mode with the VTT and wiki in one local
   install, or stays chat-and-lore only.

## Proposed, not confirmed

Ideas this product proposes beyond the operator's confirmed scope above. **None is built until the
operator confirms it.** Size: S (days), M (one to two weeks), L (more). Requested 2026-11-20 for the
operator's review.

| #    | Idea                                | Why it helps                                                                                                                            | Size | Depends on                                                                            |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| AP1  | Session zero wizard                 | A guided questionnaire turns a group's answers into the campaign frame, lines and veils, and character hooks, so a table starts aligned | M    | A57, A25                                                                              |
| AP2  | "Previously on…" recap              | A short recap at the start of a session, written from the rolling summary and the last session report, optionally read aloud            | S    | A19, A24, A29                                                                         |
| AP3  | Character consistency check         | A decision model flags a reply that contradicts the card or the lore, with a one-tap regenerate                                         | M    | A22, A14                                                                              |
| AP4  | Side-by-side replies                | The same turn sent to two models or presets at once, the better kept as the swipe; good for choosing a model                            | M    | A27                                                                                   |
| AP5  | Cost and latency per reply          | Tokens, seconds and (for hosted APIs) cost on each reply and per chat, so users see what a model costs them                             | S    | A18, A28                                                                              |
| AP6  | In-browser models on strong devices | Small decision and summary models run on the device (WebGPU) when the tier probe says it can, so lite works with no server              | L    | Device tier probe; WebLLM (MLC), as one more endpoint type (the operator, 2026-11-20) |
| AP7  | Spotlight balance                   | The GM agent tracks who has had the spotlight and draws quieter players in                                                              | M    | A20, A34                                                                              |
| AP8  | A character's memory across chats   | What a character learns in one chat can be recalled in another, per character and opt-in                                                | M    | A19 (`ai_memories`)                                                                   |
| AP9  | Lore gap finder                     | Names that come up in play with no lorebook entry or wiki page are listed, with a stub drafted for each                                 | M    | A14, A15, the wiki                                                                    |
| AP10 | A branch as an illustrated story    | Export a chat branch as an EPUB, with generated scene images                                                                            | M    | A56, A30                                                                              |
