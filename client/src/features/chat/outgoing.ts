// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the person is sending, and on which channel. The composer's switch sets the channel, and a
 * message can override it for itself the ways players already write table talk:
 * `/ooc …`, `((…))` and `//…` are out of character; `/ic …` is in character; `/gm …` asks the
 * table GM (A11, A20).
 */

export type ComposerChannel = 'ic' | 'ooc' | 'gm';

export function outgoing(raw: string, channel: ComposerChannel): { text: string; channel: ComposerChannel } | null {
  const text = raw.trim();
  if (text === '') return null;
  const command = /^\/(ooc|ic|gm)\s+([\s\S]+)$/i.exec(text);
  if (command !== null) return { text: command[2].trim(), channel: command[1].toLowerCase() as ComposerChannel };
  const wrapped = /^\(\(([\s\S]+)\)\)$/.exec(text);
  if (wrapped !== null) return { text: wrapped[1].trim(), channel: 'ooc' };
  if (text.startsWith('//')) {
    const rest = text.slice(2).trim();
    return rest === '' ? null : { text: rest, channel: 'ooc' };
  }
  return { text, channel };
}
