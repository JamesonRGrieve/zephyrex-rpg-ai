// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Slash commands in the composer (A37): the safe, declarative subset of SillyTavern's STscript the
 * design calls for. Each names something the chat already does; none runs code. `/ic`, `/ooc` and
 * `/gm` stay channel switches (outgoing.ts) and are not commands here.
 */

export type Command =
  | { name: 'sys'; text: string }
  | { name: 'sendas'; character: string; text: string }
  | { name: 'narrate' }
  | { name: 'continue' }
  | { name: 'impersonate' }
  | { name: 'xcard' }
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'help' }
  | { name: 'search'; query: string };

/** What `/help` lists, in order. */
export const COMMAND_HELP: readonly [string, string][] = [
  ['/sys <text>', 'a narrator line in the story, without a reply'],
  ['/sendas <name> <text>', 'a line as one of the cast, without a reply'],
  ['/narrate', 'the GM narrates what happens next'],
  ['/continue', 'the last reply goes on'],
  ['/impersonate', 'your next line, written for you to edit'],
  ['/xcard', 'the latest reply leaves the story'],
  ['/pause, /resume', 'stop or restart story turns'],
  ['/search <query>', 'search the web; the results are kept for the next reply to read'],
  ['/ic, /ooc, /gm <text>', 'send to the story, the table or the GM'],
  ['/setvar, /if, /while, /times … | …', 'a script: pipes ({{pipe}}), variables, conditions, loops'],
];

const CHANNEL_SWITCHES = new Set(['ic', 'ooc', 'gm']);

/**
 * The command a line is, `{ unknown }` for a slash word that is no command, or null when the line
 * is not a command at all (plain text, or a channel switch). A name with spaces is quoted:
 * `/sendas "Ada Vance" Hello`.
 */
export function parseCommand(raw: string, castNames: readonly string[] = []): Command | { unknown: string } | null {
  const text = raw.trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(text);
  if (match === null) return null;
  const name = (match[1] as string).toLowerCase();
  const rest = (match[2] ?? '').trim();
  if (CHANNEL_SWITCHES.has(name)) return null;
  switch (name) {
    case 'sys':
      return rest === '' ? { unknown: '/sys needs the line to add' } : { name: 'sys', text: rest };
    case 'sendas': {
      const quoted = /^"([^"]+)"\s+([\s\S]+)$/.exec(rest);
      const byName = castNames.find((cast) => rest.toLowerCase().startsWith(`${cast.toLowerCase()} `));
      const character = quoted?.[1] ?? byName ?? rest.split(/\s+/)[0] ?? '';
      const line = quoted?.[2] ?? (byName === undefined ? rest.slice(character.length) : rest.slice(byName.length));
      return character === '' || line.trim() === ''
        ? { unknown: '/sendas needs a name and a line' }
        : { name: 'sendas', character, text: line.trim() };
    }
    case 'search':
      return rest === '' ? { unknown: '/search needs what to search for' } : { name: 'search', query: rest };
    case 'narrate':
    case 'continue':
    case 'impersonate':
    case 'xcard':
    case 'pause':
    case 'resume':
    case 'help':
      return { name };
    default:
      return { unknown: `/${name} is not a command (try /help)` };
  }
}
