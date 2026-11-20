// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a reply cost (AP5): about how many tokens it came to (the contract's characters per token,
 * as the prompt's own estimate) and how long it took. Pure.
 */
import { PROMPT } from '~/contract';

export interface ReplyStats {
  tokens: number;
  seconds: number;
}

export function replyStats(text: string, seconds: number): ReplyStats {
  return { tokens: Math.ceil(text.trim().length / PROMPT.characters_per_token), seconds: Math.max(0, seconds) };
}

/** "About 120 tokens · 4.2 s" (a tenth of a second; whole seconds from a minute up). */
export function statsLabel(stats: ReplyStats): string {
  const time = stats.seconds >= 60 ? `${Math.round(stats.seconds)} s` : `${stats.seconds.toFixed(1)} s`;
  return `About ${stats.tokens} token${stats.tokens === 1 ? '' : 's'} · ${time}`;
}

/** `work`'s result and how many seconds it took. */
export async function timed<T>(work: () => Promise<T>): Promise<{ value: T; seconds: number }> {
  const started = performance.now();
  const value = await work();
  return { value, seconds: (performance.now() - started) / 1000 };
}
