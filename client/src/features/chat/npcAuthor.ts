// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The figures a person's line addresses or approaches who aren't people yet (the operator, 2026-11-22:
 * "when I walk up to the barkeeper, since an npc for that doesn't exist, it should author one"): a say
 * line's target no person matches, and the phrase after an approach cue ("walks up to the barkeeper",
 * "asks the guard at the gate"). Free; none means no model call. Pure, and held to
 * contract/npc-author-cases.json with ai_chat/NpcAuthor.py.
 */
import { NPC_AUTHOR } from '~/contract';
import { parsePlayerLines } from './playerLines';

export interface Figure {
  /** As the line says it: "the guard at the gate". */
  phrase: string;
  /** Their name until they have one: "The Guard". */
  name: string;
  /** What they are: "guard". */
  role: string;
}

const WORD = "[\\p{L}'-]+";
const bare = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/u, '');
const titled = (words: string): string =>
  words
    .split(' ')
    .map((word) => (word === '' ? word : (word[0] ?? '').toUpperCase() + word.slice(1)))
    .join(' ');

/** A figure from a noun phrase ("the guard", "barkeeper"); null for nothing. */
function figure(phrase: string, place = ''): Figure | null {
  const words = bare(phrase)
    .split(/\s+/u)
    .filter((word) => word !== '');
  while (words.length > 0 && (NPC_AUTHOR.stop_words as readonly string[]).includes(words.at(-1) ?? '')) words.pop();
  if (words.length === 0) return null;
  const role = words.join(' ');
  return { phrase: `the ${role}${place}`, name: `The ${titled(role)}`, role };
}

export function npcFigures(line: string, people: readonly { id: string; name: string }[]): Figure[] {
  const present = new Set(people.map((person) => bare(person.name)));
  const found: Figure[] = [];
  const keep = (one: Figure | null): void => {
    if (one === null || present.has(one.role) || found.some((other) => other.role === one.role)) return;
    found.push(one);
  };
  for (const item of parsePlayerLines(line, people)) {
    if (item.kind === 'say' && item.target_id === null && item.target_name !== null) keep(figure(item.target_name));
    if (item.kind === 'say') continue;
    const cues = [...NPC_AUTHOR.cues].sort((a, b) => b.length - a.length).map((cue) => cue.replaceAll(' ', '\\s+'));
    const places = NPC_AUTHOR.places.join('|');
    const ends = [...NPC_AUTHOR.places, ...NPC_AUTHOR.stop_words].join('|');
    // The noun is one or two words, never a place word or a stop word ("the barkeeper and orders"); a
    // place after it ("at the gate") belongs to the phrase, not the role.
    const pattern = new RegExp(
      `\\b(?:${cues.join('|')})\\s+(?:the|a|an)\\s+(${WORD}(?:\\s+(?!(?:${ends})\\b)${WORD})?)((?:\\s+(?:${places})\\s+the\\s+${WORD})?)`,
      'giu',
    );
    for (const match of item.text.matchAll(pattern)) {
      keep(figure((match[1] ?? '').toLowerCase(), (match[2] ?? '').toLowerCase().replace(/\s+/gu, ' ')));
    }
  }
  return found;
}
