// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a model is given for a character's next reply: a chat-completion message list built from
 * the character card, the persona, the chat's branch and its author's note. Pure, and held to the
 * cases in contract/prompt-cases.json, which the SaaS server runs too.
 *
 * 1. **System:** the speaker's system prompt (or the contract's default), then the card's
 *    description, personality, scenario, the persona and the example dialogue.
 * 2. **History:** the branch's story messages only (`story_channels`). Out-of-character table
 *    talk never enters the story (docs/DESIGN.md, Out-of-character). The speaker's own lines are
 *    the assistant's; everyone else's are the user's, named when the chat has several voices.
 * 3. **Author's note** at `author_note_depth` messages from the end, then the speaker's
 *    post-history instructions last.
 * 4. **Lore** (World Info, features/lore/activate.ts): its sections sit around the card
 *    (`before_char`, `after_char`), the examples and the author's note; its depth entries go into
 *    the history at their depth, with their role.
 * 5. **Budget:** the context window less the reply's room. Oldest history is dropped first; the
 *    system text, the note, the lore and the instructions always stay.
 *
 * Every card text is macro-expanded (`{{char}}`, `{{user}}`).
 *
 * The prompt manager (A16): `layout` orders the system text's sections and the author's note and
 * post-history instructions, turns any off, and cuts any to a token budget (after its macros are
 * filled in). Sections a layout leaves out follow it, on, in the contract's order. A chat's
 * `system_prompt` replaces the card's (and the default) as the `main` section.
 *
 * Modes (A6): `reply` (the next character turn), `continue` (the last message is the character's
 * own and the model carries on from it, so the post-history instructions go before it), and
 * `impersonate` (the person's own next line, asked for by the contract's instruction at the end).
 */
import { CAMPAIGN, EXPRESSION, PICTURE, PROMPT, REASONING, SAFETY, SCENARIO, TABLE } from '~/contract';
import type { DepthInsert, LoreResult } from '~/features/lore/activate';
import { applyRegex, type RegexScript } from '~/features/chat/regex';
import { expandMacros, type MacroNames } from './macros';

export interface PromptCharacter {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  example_messages: string;
  system_prompt: string;
  post_history_instructions: string;
}

export interface PromptPersona {
  name: string;
  description: string;
}

export interface PromptTurn {
  role: 'user' | 'character' | 'narrator' | 'system';
  channel: string;
  speaker_character_id: string | null;
  content: string;
  /** Set when the table X-carded it (A25): kept in the chat, never read by the model. */
  x_carded?: boolean;
}

export interface PromptInput {
  characters: readonly PromptCharacter[];
  speaker_id: string;
  persona: PromptPersona | null;
  author_note: string;
  history: readonly PromptTurn[];
  context_tokens: number;
  max_tokens: number;
  /** The active lore, from activateLore (none when the chat has no lorebooks). */
  lore?: Pick<LoreResult, 'sections' | 'at_depth'>;
  /** What is asked for (`reply` when left out). */
  mode?: PromptMode;
  /** The prompt manager's layout (the contract's order, all on, when left out). */
  layout?: readonly PromptSection[];
  /** The chat's own system prompt; blank keeps the card's. */
  system_prompt?: string;
  /** The chat's rolling summary of the story so far (A19); blank leaves the section out. */
  summary?: string;
  /** Regex scripts (A33); the prompt-only ones rewrite what the model reads of the history. */
  regex?: readonly RegexScript[];
  /** The chat's current task (A53); blank for none. */
  objective?: string;
  /** The data bank's retrieved notes (A41, features/chat/dataBank.ts); blank for none. */
  data_bank?: string;
  /** The table's safety tools (A25). */
  safety?: SafetySettings;
  /** The table's notes (A11): house rules, pacing, tone, reminders. */
  table_notes?: readonly TableNote[];
  /** The campaign's frame (A57), when the chat belongs to a campaign. */
  frame?: CampaignFrame | null;
  /** The scenario the chat is running (A59, A60), with its state. */
  scenario?: ScenarioView | null;
}

export interface ScenarioView {
  premise?: string;
  hook?: string;
  stakes?: string;
  situation?: string;
  cast?: readonly { name: string; agenda?: string; secret?: string; disposition?: string }[];
  places?: readonly string[];
  clocks?: readonly { name: string; segments: number; filled: number; advances?: string; when_full?: string }[];
  secrets?: readonly { truth: string; clues?: readonly { text: string; found: boolean }[] }[];
  beats?: readonly { text: string; done: boolean }[];
  outcomes?: readonly string[];
}

/**
 * A running scenario as the GM sees it (A59, A60): what is going on, who wants what, the clocks
 * (those about to fill flagged), each secret with its clues found or not, the beats still to come
 * and how it can end. Parts left empty are left out; nothing when there is no scenario.
 */
export function scenarioText(scenario: ScenarioView | null | undefined): string {
  if (scenario === null || scenario === undefined) return '';
  const said = (text: string | undefined) => (text ?? '').trim();
  const cast = (scenario.cast ?? []).flatMap((person) => {
    const name = said(person.name);
    if (name === '') return [];
    const disposition = said(person.disposition);
    const agenda = said(person.agenda);
    const secret = said(person.secret);
    return [
      `- ${name}${disposition === '' ? '' : ` (${disposition})`}${agenda === '' ? '' : `: wants ${agenda}`}${secret === '' ? '' : `. Secret: ${secret}`}`,
    ];
  });
  const places = (scenario.places ?? []).map((place) => place.trim()).filter(Boolean);
  const clocks = (scenario.clocks ?? []).map((clock) => {
    const filled = Math.trunc(clock.filled);
    const segments = Math.trunc(clock.segments);
    const state = filled >= segments ? 'full' : segments - filled <= SCENARIO.close_segments ? 'close to filling' : '';
    const advances = said(clock.advances);
    const whenFull = said(clock.when_full);
    return `- ${clock.name.trim()}: ${Math.min(filled, segments)}/${segments}${state === '' ? '' : ` (${state})`}${advances === '' ? '' : `; advances when ${advances}`}${whenFull === '' ? '' : `; when full: ${whenFull}`}`;
  });
  const secrets = (scenario.secrets ?? []).map((secret) => {
    const clues = (secret.clues ?? [])
      .filter((clue) => clue.text.trim() !== '')
      .map((clue) => `${clue.text.trim()} (${clue.found ? 'found' : 'not found'})`);
    const learned = (secret.clues ?? []).some((clue) => clue.found);
    return `- ${secret.truth.trim()} [${learned ? 'learned' : 'not yet learned'}]${clues.length === 0 ? '' : `. Clues: ${clues.join('; ')}`}`;
  });
  const beats = (scenario.beats ?? [])
    .filter((beat) => !beat.done && beat.text.trim() !== '')
    .map((beat) => beat.text.trim());
  const outcomes = (scenario.outcomes ?? []).map((outcome) => outcome.trim()).filter(Boolean);
  const lines = [
    said(scenario.premise) === '' ? '' : `Premise: ${said(scenario.premise)}`,
    said(scenario.hook) === '' ? '' : `Hook: ${said(scenario.hook)}`,
    said(scenario.stakes) === '' ? '' : `Stakes: ${said(scenario.stakes)}`,
    said(scenario.situation) === '' ? '' : `Situation: ${said(scenario.situation)}`,
    cast.length === 0 ? '' : `Cast:\n${cast.join('\n')}`,
    places.length === 0 ? '' : `Places: ${places.join('; ')}.`,
    clocks.length === 0 ? '' : `Clocks:\n${clocks.join('\n')}`,
    secrets.length === 0 ? '' : `Secrets and clues:\n${secrets.join('\n')}`,
    beats.length === 0 ? '' : `Beats still to come: ${beats.join('; ')}.`,
    outcomes.length === 0 ? '' : `It can end: ${outcomes.join('; ')}.`,
  ].filter((line) => line !== '');
  return lines.length === 0 ? '' : [SCENARIO.heading, ...lines].join('\n');
}

export interface CampaignFrame {
  premise?: string;
  genre?: string;
  dials?: Readonly<Record<string, number>>;
  themes?: readonly string[];
  pillars?: Readonly<Record<string, number>>;
  structure?: string | null;
  truths?: readonly string[];
  characters?: string;
  resolution_mode?: string | null;
}

function dialText(dial: { left: string; right: string }, value: number): string {
  if (value === 0) return '';
  return `${Math.abs(value) >= 2 ? 'very' : 'somewhat'} ${value < 0 ? dial.left : dial.right}`;
}

/**
 * A campaign's frame as the model reads it (A57): the table's agreement, part by part; parts left
 * empty are left out, and nothing when there is no frame.
 */
export function frameText(frame: CampaignFrame | null | undefined): string {
  if (frame === null || frame === undefined) return '';
  const dials = frame.dials ?? {};
  const tone = CAMPAIGN.dials.map((dial) => dialText(dial, Math.trunc(dials[dial.id] ?? 0)));
  const pillars = frame.pillars ?? {};
  const weights = CAMPAIGN.pillars.flatMap((pillar) => {
    const weight = Math.trunc(pillars[pillar] ?? 0);
    return weight > 0 ? [`${pillar} (${CAMPAIGN.pillar_words[weight]})`] : [];
  });
  const themes = (frame.themes ?? []).map((theme) => theme.trim()).filter(Boolean);
  const truths = (frame.truths ?? []).map((truth) => truth.trim()).filter(Boolean);
  const structures: Record<string, string> = CAMPAIGN.structure_words;
  const modes: readonly string[] = CAMPAIGN.resolution_modes;
  const premise = (frame.premise ?? '').trim();
  const genre = (frame.genre ?? '').trim();
  const characters = (frame.characters ?? '').trim();
  const lines = [
    premise === '' ? '' : `Premise: ${premise}`,
    genre === '' ? '' : `Genre: ${genre}`,
    tone.some(Boolean) ? `Tone: ${tone.filter(Boolean).join('; ')}.` : '',
    themes.length === 0 ? '' : `Themes: ${themes.join('; ')}.`,
    weights.length === 0 ? '' : `Weight of play: ${weights.join(', ')}.`,
    frame.structure != null && frame.structure in structures ? `Structure: ${structures[frame.structure]}.` : '',
    truths.length === 0 ? '' : `Setting truths:\n${truths.map((truth) => `- ${truth}`).join('\n')}`,
    characters === '' ? '' : `The characters: ${characters}`,
    frame.resolution_mode != null && modes.includes(frame.resolution_mode) ? `Resolution: ${frame.resolution_mode}.` : '',
  ].filter((line) => line !== '');
  return lines.length === 0 ? '' : [CAMPAIGN.heading, ...lines].join('\n');
}

export interface TableNote {
  kind: string;
  text: string;
}

/** The table's notes as the model reads them (A11): one labelled line each, under a heading. */
export function tableNotesText(notes: readonly TableNote[] | undefined): string {
  const labels: Record<string, string> = TABLE.note_labels;
  const kept = (notes ?? []).flatMap((note) =>
    note.kind in labels && note.text.trim() !== '' ? [`${labels[note.kind]}: ${note.text.trim()}`] : [],
  );
  return kept.length === 0 ? '' : [TABLE.notes_heading, ...kept].join('\n');
}

export interface SafetySettings {
  content_rating: string | null;
  lines: readonly string[];
  veils: readonly string[];
}

/**
 * The table's safety tools as the model reads them (A25): the content rating, the lines (never in
 * the story) and the veils (only off-screen). Nothing when none is set.
 */
export function safetyText(safety: SafetySettings | undefined): string {
  if (safety === undefined) return '';
  const ratings: Record<string, string> = SAFETY.rating_text;
  const lines = safety.lines.filter((line) => line.trim() !== '');
  const veils = safety.veils.filter((veil) => veil.trim() !== '');
  const kept = [
    safety.content_rating !== null && safety.content_rating in ratings ? (ratings[safety.content_rating] as string) : '',
    lines.length > 0 ? `${SAFETY.lines_prefix}${lines.join('; ')}.` : '',
    veils.length > 0 ? `${SAFETY.veils_prefix}${veils.join('; ')}.` : '',
  ].filter((part) => part !== '');
  return kept.length === 0 ? '' : [SAFETY.heading, ...kept].join('\n');
}

export type PromptSectionId = (typeof PROMPT.sections)[number];

export interface PromptSection {
  id: PromptSectionId;
  enabled: boolean;
  max_tokens: number | null;
}

/** The layout in full: the given sections in order (unknown and repeated ones dropped), then the rest, on. */
export function promptLayout(
  given: readonly { id: string; enabled?: boolean; max_tokens?: number | null }[] | undefined,
): PromptSection[] {
  const known: readonly string[] = PROMPT.sections;
  const layout: PromptSection[] = [];
  for (const section of given ?? []) {
    if (known.includes(section.id) && !layout.some((kept) => kept.id === section.id)) {
      layout.push({
        id: section.id as PromptSectionId,
        enabled: section.enabled ?? true,
        max_tokens: section.max_tokens ?? null,
      });
    }
  }
  return [
    ...layout,
    ...PROMPT.sections
      .filter((id) => !layout.some((kept) => kept.id === id))
      .map((id) => ({ id, enabled: true, max_tokens: null })),
  ];
}

/** A section cut to its budget (characters at the contract's ratio, counted as code points), trimmed. */
function capped(text: string, maxTokens: number | null): string {
  const trimmed = text.trim();
  if (maxTokens === null) return trimmed;
  return Array.from(trimmed)
    .slice(0, maxTokens * PROMPT.characters_per_token)
    .join('')
    .trimEnd();
}

export type PromptMode = 'reply' | 'continue' | 'impersonate' | 'narrate';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AssembledPrompt {
  messages: ModelMessage[];
  /** History turns left out to fit the window, oldest first. */
  dropped: number;
}

/** The person's name when no persona is chosen. */
export const DEFAULT_USER_NAME = 'User';
const NARRATOR = 'Narrator';

/** A rough token count: characters over the contract's ratio, plus each message's overhead. */
export function estimateTokens(message: ModelMessage): number {
  return Math.ceil(message.content.length / PROMPT.characters_per_token) + PROMPT.message_overhead_tokens;
}

type LoreSections = LoreResult['sections'];

function systemText(
  texts: Partial<Record<PromptSectionId, string>>,
  layout: readonly PromptSection[],
  names: MacroNames,
): string {
  // Each section is cut to its budget once its macros are filled in: the budget is what the model reads.
  return layout
    .flatMap((section) => {
      const text = texts[section.id];
      return section.enabled && text !== undefined ? [capped(expandMacros(text, names), section.max_tokens)] : [];
    })
    .filter((part) => part !== '')
    .join('\n\n');
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A reply's reasoning blocks (A45; the contract's tag pairs) and the reply without them. A block
 * still open at the end (the model was cut off thinking) is reasoning to the end.
 */
export function splitReasoning(text: string): { reasoning: string; reply: string } {
  const reasoning: string[] = [];
  let reply = text;
  for (const [opening, closing] of REASONING.pairs) {
    const pattern = new RegExp(`${escaped(opening as string)}([\\s\\S]*?)(?:${escaped(closing as string)}|$)\\s*`, 'g');
    for (const found of reply.matchAll(pattern)) {
      const block = (found[1] ?? '').trim();
      if (block !== '') reasoning.push(block);
    }
    reply = reply.replace(pattern, '');
  }
  return { reasoning: reasoning.join('\n\n'), reply: reply.trim() };
}

function historyMessage(
  turn: PromptTurn,
  speakerId: string,
  namesById: ReadonlyMap<string, string>,
  group: boolean,
  userName: string,
  narrating = false,
): ModelMessage {
  // A model's reasoning is never read back to it (A45).
  const thinks = turn.role === 'character' && REASONING.pairs.some(([opening]) => turn.content.includes(opening as string));
  const content = thinks ? splitReasoning(turn.content).reply : turn.content;
  if (turn.role === 'character' && turn.speaker_character_id === speakerId) {
    return { role: 'assistant', content };
  }
  if (turn.role === 'system' || turn.channel === 'roll') return { role: 'system', content: turn.content };
  // The narrator's own past narration is its own voice.
  if (narrating && turn.role === 'narrator') return { role: 'assistant', content: turn.content };
  const name =
    turn.role === 'narrator'
      ? NARRATOR
      : turn.role === 'user'
        ? userName
        : (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR);
  const named = group || turn.role !== 'user';
  return { role: 'user', content: named ? `${name}: ${content}` : content };
}

interface Insert {
  /** Messages from the end of the history it goes before (at the start when the history is shorter). */
  depth: number;
  message: ModelMessage;
}

/** The history with each insert placed at its depth; at one place, inserts keep their given order. */
function withInserts(history: readonly ModelMessage[], inserts: readonly Insert[]): ModelMessage[] {
  const at = (insert: Insert) => Math.max(0, history.length - insert.depth);
  const placed: ModelMessage[] = [];
  for (let index = 0; index <= history.length; index += 1) {
    for (const insert of inserts) if (at(insert) === index) placed.push(insert.message);
    const turn = history[index];
    if (turn !== undefined) placed.push(turn);
  }
  return placed;
}

/** The author's note with the lore placed around it, as one block (empty when there is none). */
function noteBlock(note: string, lore: LoreSections): string {
  return [lore.before_an ?? '', note, lore.after_an ?? '']
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n');
}

export function assemblePrompt(input: PromptInput): AssembledPrompt {
  const narrating = input.mode === 'narrate';
  // Narrating (A20), the GM speaks: no character is the speaker, and every character is named.
  const speaker: PromptCharacter | undefined = narrating
    ? {
        id: '',
        name: PROMPT.narrator_name,
        description: '',
        personality: '',
        scenario: '',
        example_messages: '',
        system_prompt: '',
        post_history_instructions: '',
      }
    : input.characters.find((character) => character.id === input.speaker_id);
  if (speaker === undefined) throw new Error('The speaker must be one of the chat’s characters');
  const userName = input.persona?.name ?? DEFAULT_USER_NAME;
  const names: MacroNames = { char: speaker.name, user: userName };
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const group = input.characters.length > 1 || narrating;
  const story = new Set<string>(PROMPT.story_channels);

  const loreSections: LoreSections = input.lore?.sections ?? {};
  const layout = promptLayout(input.layout);
  const sectionText = (id: PromptSectionId, text: string): string => {
    const section = layout.find((one) => one.id === id);
    return section === undefined || !section.enabled ? '' : capped(expandMacros(text, names), section.max_tokens);
  };
  const override = input.system_prompt ?? '';
  const castText = [
    PROMPT.cast_heading,
    ...input.characters
      .filter((character) => character.description.trim() !== '')
      .map(
        (character) =>
          `- ${character.name}: ${expandMacros(character.description.trim(), { char: character.name, user: userName })}`,
      ),
  ].join('\n');
  const persona = input.persona;
  const texts: Partial<Record<PromptSectionId, string>> = {
    main:
      override.trim() !== ''
        ? override
        : narrating
          ? PROMPT.narrate_prompt
          : speaker.system_prompt.trim() !== ''
            ? speaker.system_prompt
            : PROMPT.default_system_prompt,
    safety: safetyText(input.safety),
    table_notes: tableNotesText(input.table_notes),
    campaign: frameText(input.frame),
    running_scenario: scenarioText(input.scenario),
    lore_before_char: loreSections.before_char ?? '',
    // The narrator reads every character, in brief: each one's description with its own name filled in.
    description:
      narrating && input.characters.some((character) => character.description.trim() !== '')
        ? castText
        : speaker.description,
    personality: speaker.personality.trim() === '' ? '' : `{{char}}'s personality: ${speaker.personality}`,
    scenario: speaker.scenario.trim() === '' ? '' : `Scenario: ${speaker.scenario}`,
    lore_after_char: loreSections.after_char ?? '',
    persona: persona === null || persona.description.trim() === '' ? '' : `{{user}}: ${persona.description}`,
    lore_before_example: loreSections.before_example ?? '',
    examples: speaker.example_messages.trim() === '' ? '' : `Example dialogue:\n${speaker.example_messages}`,
    lore_after_example: loreSections.after_example ?? '',
    data_bank: input.data_bank ?? '',
    summary: (input.summary ?? '').trim() === '' ? '' : PROMPT.summary_prefix + (input.summary ?? ''),
  };
  const system: ModelMessage = { role: 'system', content: systemText(texts, layout, names) };
  const note = expandMacros(noteBlock(sectionText('author_note', input.author_note), loreSections), names);
  const inserts: Insert[] = [
    ...(note === '' ? [] : [{ depth: PROMPT.author_note_depth, message: { role: 'system' as const, content: note } }]),
    ...(input.lore?.at_depth ?? []).map((insert: DepthInsert) => ({
      depth: insert.depth,
      message: { role: insert.role, content: expandMacros(insert.content, names) },
    })),
    // The chat's current task (A53), a system line at its depth.
    ...((input.objective ?? '').trim() === ''
      ? []
      : [
          {
            depth: PROMPT.objective_depth,
            message: {
              role: 'system' as const,
              content: expandMacros(PROMPT.objective_prompt.replace('{{task}}', (input.objective ?? '').trim()), names),
            },
          },
        ]),
  ];
  const mode = input.mode ?? 'reply';
  const instructions = sectionText('post_history', speaker.post_history_instructions);
  const after: ModelMessage[] = [
    ...(instructions === '' ? [] : [{ role: 'system' as const, content: instructions }]),
    ...(mode === 'impersonate'
      ? [{ role: 'system' as const, content: expandMacros(PROMPT.impersonate_prompt, names) }]
      : []),
  ];
  // An X-carded turn (A25) stays in the chat but out of what the model reads.
  const storyTurns = input.history.filter((turn) => story.has(turn.channel) && turn.x_carded !== true);
  // Prompt-only regex scripts (A33) rewrite what the model reads, by each turn's depth (0 = newest).
  const history = storyTurns
    .map((turn, index) => {
      const placement = turn.role === 'user' ? 'user_input' : turn.role === 'character' ? 'ai_output' : null;
      return placement === null
        ? turn
        : {
            ...turn,
            content: applyRegex(turn.content, input.regex ?? [], placement, 'prompt', storyTurns.length - 1 - index),
          };
    })
    .map((turn) => historyMessage(turn, speaker.id, namesById, group, names.user, narrating));

  const budget = input.context_tokens - input.max_tokens;
  const cost = (messages: readonly ModelMessage[]) =>
    messages.reduce((total, message) => total + estimateTokens(message), 0);
  const fixed = cost([system, ...after, ...inserts.map((insert) => insert.message)]);

  // Keep the newest turns that fit; everything older is dropped.
  let kept = history.length;
  let used = fixed;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const next = used + estimateTokens(history[index]);
    if (next > budget) break;
    used = next;
    kept = index;
  }
  const window = history.slice(kept);
  const placed = withInserts(window, inserts);
  // Continuing: the last message is the one being carried on, so it comes after the instructions.
  const last = placed.at(-1);
  if (mode === 'continue' && last !== undefined && last.role === 'assistant') {
    return { messages: [system, ...placed.slice(0, -1), ...after, last], dropped: kept };
  }
  return { messages: [system, ...placed, ...after], dropped: kept };
}

/**
 * What a model is asked to summarise a branch (A19): the contract's instruction, then the story so
 * far as one transcript, every turn named. Out-of-character talk stays out; when the transcript
 * outgrows the window, its oldest turns are dropped.
 */
export function summaryPrompt(
  input: Pick<PromptInput, 'characters' | 'persona' | 'history' | 'context_tokens' | 'max_tokens'>,
): AssembledPrompt {
  const userName = input.persona?.name ?? DEFAULT_USER_NAME;
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const story = new Set<string>(PROMPT.story_channels);
  const lines = input.history
    .filter((turn) => story.has(turn.channel) && turn.x_carded !== true)
    .map((turn) => {
      const name =
        turn.role === 'user'
          ? userName
          : turn.role === 'character'
            ? (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR)
            : NARRATOR;
      return `${name}: ${turn.content}`;
    });
  const instruction: ModelMessage = { role: 'system', content: PROMPT.summarize_prompt };
  const budget = input.context_tokens - input.max_tokens - estimateTokens(instruction) - PROMPT.message_overhead_tokens;
  let kept = lines.length;
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    // A line costs its characters and the newline joining it.
    const cost = used + Math.ceil(((lines[index] as string).length + 1) / PROMPT.characters_per_token);
    if (cost > budget) break;
    used = cost;
    kept = index;
  }
  return { messages: [instruction, { role: 'user', content: lines.slice(kept).join('\n') }], dropped: kept };
}

/** What a model is asked to translate `text` into `language` (A43). */
export function translatePrompt(text: string, language: string): ModelMessage[] {
  return [
    { role: 'system', content: PROMPT.translate_prompt.replace('{{language}}', language) },
    { role: 'user', content: text },
  ];
}

/**
 * What the table GM reads to answer the players out of character (A11, A20). The system text: the
 * contract's GM prompt, the safety tools, the table notes, the summary and the last few story turns
 * (named, X-carded ones left out), for reference only. Then the table talk (`ooc` and `gm`) as the
 * conversation: the players' lines as the user's, named, and the GM's (a narrator on the `gm`
 * channel) as the assistant's. The oldest table talk is dropped to fit.
 */
export function tableGmPrompt(
  input: Pick<
    PromptInput,
    'characters' | 'persona' | 'history' | 'context_tokens' | 'max_tokens' | 'summary' | 'safety' | 'table_notes'
  >,
): AssembledPrompt {
  const userName = input.persona?.name ?? DEFAULT_USER_NAME;
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const named = (turn: PromptTurn) =>
    turn.role === 'user'
      ? userName
      : turn.role === 'character'
        ? (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR)
        : NARRATOR;
  const story = new Set<string>(PROMPT.story_channels);
  const recent = input.history
    .filter((turn) => story.has(turn.channel) && turn.x_carded !== true)
    .slice(-TABLE.recent_story_turns)
    .map((turn) => `${named(turn)}: ${turn.content}`);
  const summary = input.summary ?? '';
  const parts = [
    TABLE.gm_prompt,
    safetyText(input.safety),
    tableNotesText(input.table_notes),
    summary.trim() === '' ? '' : PROMPT.summary_prefix + summary,
    recent.length === 0 ? '' : [TABLE.recent_story_heading, ...recent].join('\n'),
  ];
  const system: ModelMessage = {
    role: 'system',
    content: parts
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join('\n\n'),
  };
  const talk: ModelMessage[] = input.history
    .filter((turn) => turn.channel === 'ooc' || turn.channel === 'gm')
    .map((turn) =>
      turn.role === 'narrator' && turn.channel === 'gm'
        ? { role: 'assistant', content: turn.content }
        : { role: 'user', content: `${named(turn)}: ${turn.content}` },
    );
  const budget = input.context_tokens - input.max_tokens - estimateTokens(system);
  let kept = talk.length;
  let used = 0;
  for (let index = talk.length - 1; index >= 0; index -= 1) {
    const cost = used + estimateTokens(talk[index] as ModelMessage);
    if (cost > budget) break;
    used = cost;
    kept = index;
  }
  return { messages: [system, ...talk.slice(kept)], dropped: kept };
}

/** What a model is asked to name a line's feeling (A4), choosing only from `options`. */
export function expressionPrompt(line: string, options: readonly string[]): ModelMessage[] {
  return [
    { role: 'system', content: EXPRESSION.prompt.replace('{{options}}', options.join(', ')) },
    { role: 'user', content: line },
  ];
}

/**
 * The option a decision model's answer names: the first option, in the answer's order, whose word
 * appears in it (ignoring case); none when it names none. A model never invents one.
 */
export function pickOption(answer: string, options: readonly string[]): string | null {
  const byWord = new Map(options.map((option) => [option.toLowerCase(), option]));
  const word = (answer.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).find((one) => byWord.has(one));
  return word === undefined ? null : (byWord.get(word) ?? null);
}

/**
 * What an image model is asked to draw (A30): the person's own words, or the last story turns
 * (named; table talk and X-carded turns left out) as a scene, cut to the contract's length (code points).
 */
export function scenePicturePrompt(input: Pick<PromptInput, 'characters' | 'persona' | 'history'>, asked = ''): string {
  const cut = (text: string) => Array.from(text).slice(0, PICTURE.prompt_characters).join('');
  if (asked.trim() !== '') return cut(asked.trim());
  const userName = input.persona?.name ?? DEFAULT_USER_NAME;
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const story = new Set<string>(PROMPT.story_channels);
  const named = (turn: PromptTurn) =>
    turn.role === 'user'
      ? userName
      : turn.role === 'character'
        ? (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR)
        : NARRATOR;
  const scene = input.history
    .filter((turn) => story.has(turn.channel) && turn.x_carded !== true)
    .slice(-PICTURE.scene_turns)
    .map((turn) => `${named(turn)}: ${splitReasoning(turn.content).reply}`)
    .join(' ');
  return cut(PICTURE.scene_prefix + scene);
}
