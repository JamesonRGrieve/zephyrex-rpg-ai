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
import { PROMPT } from '~/contract';
import type { DepthInsert, LoreResult } from '~/features/lore/activate';
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
}

export type PromptSectionId = (typeof PROMPT.sections)[number];

export interface PromptSection {
  id: PromptSectionId;
  enabled: boolean;
  max_tokens: number | null;
}

/** The layout in full: the given sections in order (unknown and repeated ones dropped), then the rest, on. */
export function promptLayout(given: readonly { id: string; enabled?: boolean; max_tokens?: number | null }[] | undefined): PromptSection[] {
  const known: readonly string[] = PROMPT.sections;
  const layout: PromptSection[] = [];
  for (const section of given ?? []) {
    if (known.includes(section.id) && !layout.some((kept) => kept.id === section.id)) {
      layout.push({ id: section.id as PromptSectionId, enabled: section.enabled ?? true, max_tokens: section.max_tokens ?? null });
    }
  }
  return [...layout, ...PROMPT.sections.filter((id) => !layout.some((kept) => kept.id === id)).map((id) => ({ id, enabled: true, max_tokens: null }))];
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

export type PromptMode = 'reply' | 'continue' | 'impersonate';

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

function systemText(texts: Partial<Record<PromptSectionId, string>>, layout: readonly PromptSection[], names: MacroNames): string {
  // Each section is cut to its budget once its macros are filled in: the budget is what the model reads.
  return layout
    .flatMap((section) => {
      const text = texts[section.id];
      return section.enabled && text !== undefined ? [capped(expandMacros(text, names), section.max_tokens)] : [];
    })
    .filter((part) => part !== '')
    .join('\n\n');
}

function historyMessage(
  turn: PromptTurn,
  speakerId: string,
  namesById: ReadonlyMap<string, string>,
  group: boolean,
  userName: string,
): ModelMessage {
  if (turn.role === 'character' && turn.speaker_character_id === speakerId) {
    return { role: 'assistant', content: turn.content };
  }
  if (turn.role === 'system' || turn.channel === 'roll') return { role: 'system', content: turn.content };
  const name =
    turn.role === 'narrator'
      ? NARRATOR
      : turn.role === 'user'
        ? userName
        : (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR);
  const named = group || turn.role !== 'user';
  return { role: 'user', content: named ? `${name}: ${turn.content}` : turn.content };
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
  const speaker = input.characters.find((character) => character.id === input.speaker_id);
  if (speaker === undefined) throw new Error('The speaker must be one of the chat’s characters');
  const names: MacroNames = { char: speaker.name, user: input.persona?.name ?? DEFAULT_USER_NAME };
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const group = input.characters.length > 1;
  const story = new Set<string>(PROMPT.story_channels);

  const loreSections: LoreSections = input.lore?.sections ?? {};
  const layout = promptLayout(input.layout);
  const sectionText = (id: PromptSectionId, text: string): string => {
    const section = layout.find((one) => one.id === id);
    return section === undefined || !section.enabled ? '' : capped(expandMacros(text, names), section.max_tokens);
  };
  const override = input.system_prompt ?? '';
  const persona = input.persona;
  const texts: Partial<Record<PromptSectionId, string>> = {
    main: override.trim() !== '' ? override : speaker.system_prompt.trim() !== '' ? speaker.system_prompt : PROMPT.default_system_prompt,
    lore_before_char: loreSections.before_char ?? '',
    description: speaker.description,
    personality: speaker.personality.trim() === '' ? '' : `{{char}}'s personality: ${speaker.personality}`,
    scenario: speaker.scenario.trim() === '' ? '' : `Scenario: ${speaker.scenario}`,
    lore_after_char: loreSections.after_char ?? '',
    persona: persona === null || persona.description.trim() === '' ? '' : `{{user}}: ${persona.description}`,
    lore_before_example: loreSections.before_example ?? '',
    examples: speaker.example_messages.trim() === '' ? '' : `Example dialogue:\n${speaker.example_messages}`,
    lore_after_example: loreSections.after_example ?? '',
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
  ];
  const mode = input.mode ?? 'reply';
  const instructions = sectionText('post_history', speaker.post_history_instructions);
  const after: ModelMessage[] = [
    ...(instructions === '' ? [] : [{ role: 'system' as const, content: instructions }]),
    ...(mode === 'impersonate' ? [{ role: 'system' as const, content: expandMacros(PROMPT.impersonate_prompt, names) }] : []),
  ];
  const history = input.history
    .filter((turn) => story.has(turn.channel))
    .map((turn) => historyMessage(turn, speaker.id, namesById, group, names.user));

  const budget = input.context_tokens - input.max_tokens;
  const cost = (messages: readonly ModelMessage[]) => messages.reduce((total, message) => total + estimateTokens(message), 0);
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
    .filter((turn) => story.has(turn.channel))
    .map((turn) => {
      const name = turn.role === 'user' ? userName : turn.role === 'character' ? (namesById.get(turn.speaker_character_id ?? '') ?? NARRATOR) : NARRATOR;
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
