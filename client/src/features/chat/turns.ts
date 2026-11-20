// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whose turn it is, and what a fork offers. Pure helpers over a chat's branch.
 */
import type { TreeMessage } from './branch';

export interface TurnMessage extends TreeMessage {
  role: string;
  channel: string;
  speaker_character_id: string | null;
  /** What it says, when the caller has it: natural order reads the last story line (A52). */
  swipes?: readonly string[];
  swipe_index?: number;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Natural order (A52), as SillyTavern's: the member the last story line names (the earliest named,
 * not muted, and not the one who said it) speaks next; null when it names none.
 */
export function mentionedSpeaker(
  characterIds: readonly string[],
  branch: readonly TurnMessage[],
  muted: readonly string[],
  names: ReadonlyMap<string, string>,
): string | null {
  const last = [...branch].reverse().find((message) => message.channel === 'ic');
  const text = last?.swipes?.[last.swipe_index ?? 0] ?? '';
  if (text === '') return null;
  let found: { id: string; at: number } | null = null;
  for (const id of characterIds) {
    const name = (names.get(id) ?? '').trim();
    if (name === '' || muted.includes(id) || id === last?.speaker_character_id) continue;
    const at = text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, 'iu'));
    if (at !== -1 && (found === null || at < found.at)) found = { id, at };
  }
  return found?.id ?? null;
}

/**
 * Who replies next. Alone, the one character. In a group, the member the last story line names
 * (natural order, when `names` is given), else the character after the last one who spoke in the
 * story, in the chat's order; muted members are skipped (A52), and null when all are muted.
 */
export function nextSpeaker(
  characterIds: readonly string[],
  branch: readonly TurnMessage[],
  muted: readonly string[] = [],
  names?: ReadonlyMap<string, string>,
): string | null {
  if (characterIds.length === 0) return null;
  if (names !== undefined && characterIds.length > 1) {
    const named = mentionedSpeaker(characterIds, branch, muted, names);
    if (named !== null) return named;
  }
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

/**
 * How a chat opens (A52): each member's greeting in the cast's order (a group greets in turn, as
 * SillyTavern's group greetings do), each with its alternates as swipes; members without one are skipped.
 */
export function openingTurns(
  cast: readonly { id: string; first_message: string; alternate_greetings: readonly string[] }[],
): { speakerId: string; swipes: string[] }[] {
  return cast.flatMap((member) => {
    const swipes = greetingSwipes(member.first_message, member.alternate_greetings);
    return swipes.length === 0 ? [] : [{ speakerId: member.id, swipes }];
  });
}

/** A character's opening: the first message, then the alternate greetings, as one message's swipes. */
export function greetingSwipes(firstMessage: string, alternates: readonly string[]): string[] {
  return [firstMessage, ...alternates].filter((greeting) => greeting.trim() !== '');
}
