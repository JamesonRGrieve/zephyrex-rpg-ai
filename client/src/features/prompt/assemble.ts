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
 * 4. **Budget:** the context window less the reply's room. Oldest history is dropped first; the
 *    system text, the note and the instructions always stay.
 *
 * Every card text is macro-expanded (`{{char}}`, `{{user}}`).
 */
import { PROMPT } from '~/contract';
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
}

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

function systemText(speaker: PromptCharacter, persona: PromptPersona | null, names: MacroNames): string {
  const sections = [
    speaker.system_prompt.trim() === '' ? PROMPT.default_system_prompt : speaker.system_prompt,
    speaker.description,
    speaker.personality.trim() === '' ? '' : `{{char}}'s personality: ${speaker.personality}`,
    speaker.scenario.trim() === '' ? '' : `Scenario: ${speaker.scenario}`,
    persona === null || persona.description.trim() === '' ? '' : `{{user}}: ${persona.description}`,
    speaker.example_messages.trim() === '' ? '' : `Example dialogue:\n${speaker.example_messages}`,
  ];
  return expandMacros(
    sections
      .map((section) => section.trim())
      .filter((section) => section !== '')
      .join('\n\n'),
    names,
  );
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

/** Inserts `note` `depth` messages from the end of `history` (at the start when it is shorter). */
function withAuthorNote(history: ModelMessage[], note: string): ModelMessage[] {
  if (note.trim() === '') return history;
  const at = Math.max(0, history.length - PROMPT.author_note_depth);
  return [...history.slice(0, at), { role: 'system', content: note }, ...history.slice(at)];
}

export function assemblePrompt(input: PromptInput): AssembledPrompt {
  const speaker = input.characters.find((character) => character.id === input.speaker_id);
  if (speaker === undefined) throw new Error('The speaker must be one of the chat’s characters');
  const names: MacroNames = { char: speaker.name, user: input.persona?.name ?? DEFAULT_USER_NAME };
  const namesById = new Map(input.characters.map((character) => [character.id, character.name]));
  const group = input.characters.length > 1;
  const story = new Set<string>(PROMPT.story_channels);

  const system: ModelMessage = { role: 'system', content: systemText(speaker, input.persona, names) };
  const note = expandMacros(input.author_note, names);
  const after = speaker.post_history_instructions.trim() === '' ? [] : [{ role: 'system' as const, content: expandMacros(speaker.post_history_instructions, names) }];
  const history = input.history
    .filter((turn) => story.has(turn.channel))
    .map((turn) => historyMessage(turn, speaker.id, namesById, group, names.user));

  const budget = input.context_tokens - input.max_tokens;
  const cost = (messages: readonly ModelMessage[]) => messages.reduce((total, message) => total + estimateTokens(message), 0);
  const fixed = cost([system, ...after]) + (note.trim() === '' ? 0 : estimateTokens({ role: 'system', content: note }));

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
  return { messages: [system, ...withAuthorNote(window, note), ...after], dropped: kept };
}
