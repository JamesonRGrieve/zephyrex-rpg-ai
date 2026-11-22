// SPDX-License-Identifier: AGPL-3.0-or-later
// A thinking model's story turn (the operator, 2026-11-22: "Why don't we want thinking? Doesn't it improve
// narration quality? Just put thinking in a collapsible under narrator."): what a model streams split into
// its thinking (the contract's reasoning pairs, tags kept) and its answer, as it comes, so the thinking goes
// to the client as it is and only the answer meets the reply's guards. Twin of ai_chat/Thinking.py.
import { REASONING, THINKING, THINKING_OFF } from '~/contract';

export type ThinkingMode = 'on' | 'off' | null;
export type ThinkPiece = ['think' | 'answer', string];

const PAIRS = REASONING.pairs.map(([opening, closing]) => [String(opening), String(closing)] as const);

/** None for a model that doesn't think (no reasoning_effort trait), "off" where it chokes (thinking: false). */
export function thinkingMode(traits: { reasoning_effort?: string | null; thinking?: boolean }): ThinkingMode {
  if (typeof traits.reasoning_effort !== 'string' || traits.reasoning_effort === '') return null;
  return traits.thinking === false ? 'off' : 'on';
}

/** The request fields for a story turn's thinking: on, briefly; off, in each server's own words. */
export function thinkingFields(mode: ThinkingMode | undefined, effort: string | null | undefined): Record<string, unknown> {
  if (mode === 'on') return { ...THINKING.fields, reasoning_effort: THINKING.story_effort };
  if (mode === 'off') return { ...THINKING_OFF.fields, reasoning_effort: effort ?? 'none' };
  return {};
}

/** How many of text's last characters could begin one of the tags (held for the next piece). */
function partial(text: string, tags: readonly string[]): number {
  let longest = 0;
  for (const tag of tags) {
    for (let size = Math.min(tag.length - 1, text.length); size > 0; size -= 1) {
      if (text.endsWith(tag.slice(0, size))) {
        longest = Math.max(longest, size);
        break;
      }
    }
  }
  return longest;
}

/** Splits streamed text into think and answer pieces, a tag cut across pieces held until it is whole. */
export function thinkSplitter(): {
  take: (text: string) => ThinkPiece[];
  end: () => ThinkPiece[];
  inside: () => boolean;
  overBudget: () => boolean;
} {
  let closing: string | null = null;
  let held = '';
  let thought = 0;
  const take = (text: string): ThinkPiece[] => {
    const out: ThinkPiece[] = [];
    const add = (kind: 'think' | 'answer', piece: string) => {
      if (piece === '') return;
      if (kind === 'think') thought += piece.length;
      const last = out.at(-1);
      if (last !== undefined && last[0] === kind) last[1] += piece;
      else out.push([kind, piece]);
    };
    let rest = held + text;
    held = '';
    while (rest !== '') {
      if (closing !== null) {
        const at = rest.indexOf(closing);
        if (at >= 0) {
          add('think', rest.slice(0, at + closing.length));
          rest = rest.slice(at + closing.length);
          closing = null;
          continue;
        }
        const keep = partial(rest, [closing]);
        add('think', rest.slice(0, rest.length - keep));
        held = rest.slice(rest.length - keep);
        break;
      }
      const found = PAIRS.map(([opening, close]) => [rest.indexOf(opening), opening, close] as const)
        .filter(([at]) => at >= 0)
        .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))[0];
      if (found !== undefined) {
        const [at, opening, close] = found;
        add('answer', rest.slice(0, at));
        add('think', opening);
        rest = rest.slice(at + opening.length);
        closing = close;
        continue;
      }
      const keep = partial(
        rest,
        PAIRS.map(([opening]) => opening),
      );
      add('answer', rest.slice(0, rest.length - keep));
      held = rest.slice(rest.length - keep);
      break;
    }
    return out;
  };
  const end = (): ThinkPiece[] => {
    const out: ThinkPiece[] = [];
    if (held !== '') out.push([closing === null ? 'answer' : 'think', held]);
    held = '';
    if (closing !== null) out.push(['think', closing]);
    closing = null;
    return out;
  };
  return { take, end, inside: () => closing !== null, overBudget: () => thought > THINKING.max_chars };
}
