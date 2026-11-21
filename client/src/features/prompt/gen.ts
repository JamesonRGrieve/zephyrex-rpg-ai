// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What STscript's /gen and /genraw ask the chat's model (audit gap 5), as SillyTavern's do: /gen,
 * the chat's own prompt with the instruction as its last line (a reply's prefill is left out: the
 * answer isn't a reply); /genraw, the instruction alone. Pure, and held to contract/gen-cases.json,
 * which the SaaS server's Gen.py runs too.
 */
import type { ModelMessage } from './assemble';

export function genMessages(chat: readonly ModelMessage[], instruction: string, raw: boolean, prefill = ''): ModelMessage[] {
  if (raw) return [{ role: 'user', content: instruction }];
  const last = chat.at(-1);
  const kept = prefill !== '' && last?.role === 'assistant' && last.content === prefill ? chat.slice(0, -1) : [...chat];
  return [...kept, { role: 'system', content: instruction }];
}
