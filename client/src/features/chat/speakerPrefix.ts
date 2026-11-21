// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A reply that starts with its own speaker's name ("Gus Veridan: Gus leans…"): in a group the model
 * copies the "Name:" prefix it reads on other lines. SillyTavern strips it; so does this, once, at
 * the start, as plain or bold ("**Gus Veridan**:"), any case. A reasoning block (<think>…) before
 * it is kept.
 */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function withoutSpeakerPrefix(text: string, name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return text;
  const reasoning = /^\s*<think>[\s\S]*?<\/think>\s*/i.exec(text)?.[0] ?? '';
  const reply = text.slice(reasoning.length);
  const prefix = new RegExp(`^\\s*(\\*\\*)?${escaped(trimmed)}(\\*\\*)?\\s*:\\s*`, 'i');
  return reasoning + reply.replace(prefix, '');
}
