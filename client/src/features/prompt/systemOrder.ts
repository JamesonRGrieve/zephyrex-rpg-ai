// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The person's last line goes last (Self Hosted AI, 2026-11-21: the Mistral-family Ollama template
 * renders system messages only on a final user turn, so a rule after the player's line vanished and
 * the narrator replayed a round in markdown). On the wire to a chat API, every system message after the
 * last user turn moves to just before it, in order; a list with no user turn is as it was. Pure, and
 * held to contract/system-order-cases.json with ai_chat/SystemOrder.py.
 */
export function systemsBeforeLastUser<T extends { role: string }>(messages: readonly T[]): T[] {
  const last = messages.map((message) => message.role).lastIndexOf('user');
  if (last === -1) return [...messages];
  const after = messages.slice(last + 1);
  const moved = after.filter((message) => message.role === 'system');
  if (moved.length === 0) return [...messages];
  return [
    ...messages.slice(0, last),
    ...moved,
    messages[last] as T,
    ...after.filter((message) => message.role !== 'system'),
  ];
}
