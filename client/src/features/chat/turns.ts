// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whose turn it is, and what a fork offers. Pure helpers over a chat's branch.
 */
import type { TreeMessage } from './branch';

export interface TurnMessage extends TreeMessage {
  role: string;
  channel: string;
  speaker_character_id: string | null;
}

/**
 * Who replies next. Alone, the one character. In a group, the character after the last one who
 * spoke in the story, in the chat's order, skipping muted members (A52); null when all are muted.
 * (A simple turn order; the decision model takes over in a later phase, docs/DESIGN.md.)
 */
export function nextSpeaker(
  characterIds: readonly string[],
  branch: readonly TurnMessage[],
  muted: readonly string[] = [],
): string | null {
  if (characterIds.length === 0) return null;
  const last = [...branch].reverse().find((message) => message.role === 'character' && message.channel === 'ic');
  const index =
    last === undefined || last.speaker_character_id === null ? -1 : characterIds.indexOf(last.speaker_character_id);
  const order = characterIds.map((_id, step) => characterIds[(index + 1 + step) % characterIds.length] as string);
  return order.find((id) => !muted.includes(id)) ?? null;
}

/** The messages that share `message`'s parent (its alternatives at a fork), and its place among them. */
export function siblingsOf<M extends TreeMessage>(messages: readonly M[], message: M): { siblings: M[]; index: number } {
  const siblings = messages.filter((other) => other.parent_id === message.parent_id);
  return { siblings, index: siblings.findIndex((other) => other.id === message.id) };
}

/** A character's opening: the first message, then the alternate greetings, as one message's swipes. */
export function greetingSwipes(firstMessage: string, alternates: readonly string[]): string[] {
  return [firstMessage, ...alternates].filter((greeting) => greeting.trim() !== '');
}
