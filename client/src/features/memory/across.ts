// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A character's memory across chats (AP8), on recall by meaning (A19, memory.ts). Opt-in per
 * character: with its flag on, recall for that character's replies also searches the memories of
 * the person's other chats it was cast in (never anyone else's). Pure, and held to
 * contract/memory-across-cases.json, which the SaaS server's MemoryAcross.py runs too.
 *
 * One pool, one budget: this chat's lines and the other chats' are scored alike (the closest first;
 * on a tie this chat's, then the earlier), up to `recall` of them within `section_tokens`. The
 * section lists this chat's in story order under the prefix, then the other chats' under their own
 * label, whose tokens count only once one of them is kept.
 */
import { MEMORY, PROMPT } from '~/contract';
import { cosine, type Remembered } from './memory';

/** Where the flag is kept on a character: `extensions[MEMORY_EXTENSION].across_chats`. */
export const MEMORY_EXTENSION: string = MEMORY.extension;

/** Whether a character remembers across chats (off unless set, and set exactly to true). */
export function remembersAcrossChats(extensions: Readonly<Record<string, unknown>>): boolean {
  return Reflect.get(Object(extensions[MEMORY_EXTENSION]), 'across_chats') === true;
}

/** The extensions with the flag set; off leaves no trace. */
export function withAcrossChats(extensions: Readonly<Record<string, unknown>>, on: boolean): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== MEMORY_EXTENSION));
  return on ? { ...rest, [MEMORY_EXTENSION]: { across_chats: true } } : rest;
}

export interface Recalled {
  /** From this chat, in story order. */
  here: string[];
  /** From the character's other chats, in their order. */
  elsewhere: string[];
}

const points = (text: string) => Array.from(text);
const tokensOf = (text: string) => Math.ceil(points(text).length / PROMPT.characters_per_token);

/** The label over the other chats' lines, the character named. */
export const elsewhereLabel = (name: string): string => MEMORY.elsewhere_label.replaceAll('{{char}}', name);

/** The closest of this chat's and the other chats' memories, within the section's budget. */
export function recallAcross(
  query: readonly number[],
  here: readonly Remembered[],
  elsewhere: readonly Remembered[],
  name: string,
): Recalled {
  const close = [
    ...here.map((memory) => ({ ...memory, away: false })),
    ...elsewhere.map((memory) => ({ ...memory, away: true })),
  ]
    .map((memory) => ({ ...memory, similarity: cosine(query, memory.vector) }))
    .filter((memory) => memory.similarity >= MEMORY.min_similarity)
    .sort((a, b) => b.similarity - a.similarity || Number(a.away) - Number(b.away) || a.order - b.order);
  const kept: typeof close = [];
  let spent = tokensOf(MEMORY.prefix);
  for (const memory of close) {
    if (kept.length === MEMORY.recall) break;
    const label = memory.away && !kept.some((one) => one.away) ? tokensOf(elsewhereLabel(name)) + 1 : 0;
    const cost = tokensOf(memory.text) + (kept.length === 0 ? 0 : 1) + label;
    if (spent + cost > MEMORY.section_tokens) continue;
    kept.push(memory);
    spent += cost;
  }
  const inOrder = (away: boolean) =>
    kept
      .filter((memory) => memory.away === away)
      .sort((a, b) => a.order - b.order)
      .map((memory) => memory.text);
  return { here: inOrder(false), elsewhere: inOrder(true) };
}

/** The prompt section: this chat's lines under the prefix, then the other chats' under their label. */
export function acrossText(recalled: Recalled, name: string): string {
  if (recalled.here.length === 0 && recalled.elsewhere.length === 0) return '';
  const parts = recalled.here.length === 0 ? [] : [recalled.here.join('\n\n')];
  if (recalled.elsewhere.length > 0) parts.push(elsewhereLabel(name) + recalled.elsewhere.join('\n\n'));
  return MEMORY.prefix + parts.join('\n\n');
}
