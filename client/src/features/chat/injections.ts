// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * STscript's /inject, /listinjects and /flushinject (audit gap 5), as SillyTavern's: a chat keeps
 * named injections until they're flushed. Each has an id, its text, and where it goes (`chat`: at a
 * depth in the chat, with a role; `before` or `after`: at the start or end of the system prompt).
 * Pure, and held to contract/injection-cases.json, which the SaaS server's Injections.py runs too.
 */
import { INJECTIONS } from '~/contract';

export interface Injection {
  id: string;
  text: string;
  position: (typeof INJECTIONS.positions)[number];
  depth: number;
  role: (typeof INJECTIONS.roles)[number];
}

const chars = (text: string) => Array.from(text).length;

/** Why `value` can't be kept as a chat's injections, or null. */
export function injectionsProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'Injections are a list';
  if (value.length > INJECTIONS.max) return `At most ${INJECTIONS.max} injections`;
  const ids = new Set<string>();
  for (const item of value as unknown[]) {
    const injection = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const { id, text, position, depth, role } = injection;
    if (typeof id !== 'string' || id.trim() === '' || chars(id) > INJECTIONS.id_characters)
      return `An injection's id is text of 1 to ${INJECTIONS.id_characters} characters`;
    if (ids.has(id)) return `${id} is injected twice`;
    ids.add(id);
    if (typeof text !== 'string' || chars(text) > INJECTIONS.text_characters)
      return `An injection's text is at most ${INJECTIONS.text_characters} characters`;
    if (!(INJECTIONS.positions as readonly unknown[]).includes(position))
      return `An injection's position is ${INJECTIONS.positions.join(', ')}`;
    if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0 || depth > INJECTIONS.depth_max)
      return `An injection's depth is a whole number from 0 to ${INJECTIONS.depth_max}`;
    if (!(INJECTIONS.roles as readonly unknown[]).includes(role))
      return `An injection's role is ${INJECTIONS.roles.join(', ')}`;
  }
  return null;
}

/** `/inject id=… [position=…] [depth=…] [role=…] text`: the chat's injections with it set (an empty text removes it). */
export function withInjection(
  injections: readonly Injection[],
  args: Readonly<Record<string, string>>,
  text: string,
): Injection[] {
  const id = (args.id ?? '').trim();
  if (id === '') throw new Error('/inject needs an id=');
  const rest = injections.filter((one) => one.id !== id);
  if (text.trim() === '') return rest;
  const position = (INJECTIONS.positions as readonly string[]).includes(args.position ?? '')
    ? (args.position as Injection['position'])
    : 'chat';
  const asked = Number(args.depth);
  const depth = Number.isInteger(asked) && asked >= 0 ? Math.min(asked, INJECTIONS.depth_max) : INJECTIONS.default_depth;
  const role = (INJECTIONS.roles as readonly string[]).includes(args.role ?? '')
    ? (args.role as Injection['role'])
    : 'system';
  return [...rest, { id, text, position, depth, role }];
}

/** `/flushinject [id]`: the chat's injections less that one (all of them when no id is given). */
export function withoutInjection(injections: readonly Injection[], id: string): Injection[] {
  return id.trim() === '' ? [] : injections.filter((one) => one.id !== id.trim());
}

/** `/listinjects`: one line per injection. */
export function injectionsText(injections: readonly Injection[]): string {
  return injections
    .map((one) => `${one.id} (${one.position === 'chat' ? `depth ${one.depth}, ${one.role}` : one.position}): ${one.text}`)
    .join('\n');
}
