// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whose turn it is, and what a fork offers. Pure helpers over a chat's branch.
 */
import { GROUP_SETTINGS } from '~/contract';
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
  allowSelf = false,
): string | null {
  const last = [...branch].reverse().find((message) => message.channel === 'ic');
  const text = last?.swipes?.[last.swipe_index ?? 0] ?? '';
  if (text === '') return null;
  let found: { id: string; at: number } | null = null;
  for (const id of characterIds) {
    const name = (names.get(id) ?? '').trim();
    if (name === '' || muted.includes(id) || (!allowSelf && id === last?.speaker_character_id)) continue;
    const at = text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, 'iu'));
    if (at !== -1 && (found === null || at < found.at)) found = { id, at };
  }
  return found?.id ?? null;
}

/** A card's talkativeness (V2 `extensions.talkativeness`, 0 to 1); SillyTavern's 0.5 when unset or unreadable. */
export function talkativenessOf(extensions: Readonly<Record<string, unknown>> | undefined): number {
  const raw = extensions?.talkativeness;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/**
 * A draw in [0, 1) fixed by its seed (FNV-1a): the same chat state always gives the same next
 * speaker, so "up next" and the reply it promises agree.
 */
export function seededDraw(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

/** How a group takes turns (audit gap 6): its order, and whether natural order may pick who just spoke. */
export interface TurnOptions {
  order?: (typeof GROUP_SETTINGS.orders)[number];
  allowSelf?: boolean;
}

/**
 * Pooled order (audit gap 6, SillyTavern's): a member who hasn't spoken since the person's last
 * story line, drawn by the branch's seed; once all have, any member but the last to speak.
 */
export function pooledSpeaker(
  characterIds: readonly string[],
  branch: readonly TurnMessage[],
  muted: readonly string[],
): string | null {
  const awake = characterIds.filter((id) => !muted.includes(id));
  if (awake.length === 0) return null;
  const lastPerson = branch.findLastIndex((message) => message.role === 'user' && message.channel === 'ic');
  const spoken = new Set(
    branch
      .slice(lastPerson + 1)
      .filter((message) => message.role === 'character' && message.channel === 'ic')
      .map((message) => message.speaker_character_id),
  );
  const lastSpeaker = [...branch]
    .reverse()
    .find((message) => message.role === 'character' && message.channel === 'ic')?.speaker_character_id;
  const unheard = awake.filter((id) => !spoken.has(id));
  const pool = unheard.length > 0 ? unheard : awake.length > 1 ? awake.filter((id) => id !== lastSpeaker) : awake;
  const draw = seededDraw(`${branch.at(-1)?.id ?? ''}:pool`);
  return pool[Math.floor(draw * pool.length)] ?? null;
}

/**
 * Who replies next. Alone, the one character. In a group, the member the last story line names
 * (natural order, when `names` is given); failing that, with `talkativeness` given (gap 7, as
 * SillyTavern's natural order), the first member after the last speaker whose talkativeness wins
 * its draw. Otherwise the character after the last one who spoke in the story, in the chat's
 * order. Muted members are skipped (A52), and null when all are muted.
 */
export function nextSpeaker(
  characterIds: readonly string[],
  branch: readonly TurnMessage[],
  muted: readonly string[] = [],
  names?: ReadonlyMap<string, string>,
  talkativeness?: ReadonlyMap<string, number>,
  options: TurnOptions = {},
): string | null {
  if (characterIds.length === 0) return null;
  const order = options.order ?? 'natural';
  if (order === 'pooled' && characterIds.length > 1) return pooledSpeaker(characterIds, branch, muted);
  const natural = order === 'natural';
  if (natural && names !== undefined && characterIds.length > 1) {
    const named = mentionedSpeaker(characterIds, branch, muted, names, options.allowSelf ?? false);
    if (named !== null) return named;
  }
  const last = [...branch].reverse().find((message) => message.role === 'character' && message.channel === 'ic');
  const index =
    last === undefined || last.speaker_character_id === null ? -1 : characterIds.indexOf(last.speaker_character_id);
  const turnOrder = characterIds
    .map((_id, step) => characterIds[(index + 1 + step) % characterIds.length] as string)
    .filter((id) => !muted.includes(id));
  if (natural && talkativeness !== undefined && characterIds.length > 1) {
    const seed = branch.at(-1)?.id ?? '';
    // Without allow_self, the one who just spoke waits unless no one else wins the draw.
    const lastId = last?.speaker_character_id ?? null;
    const drawn = options.allowSelf === true ? turnOrder : turnOrder.filter((id) => id !== lastId);
    const eager = drawn.find((id) => seededDraw(`${seed}:${id}`) < (talkativeness.get(id) ?? 0.5));
    if (eager !== undefined) return eager;
  }
  return turnOrder[0] ?? null;
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
