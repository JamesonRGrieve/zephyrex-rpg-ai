// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * NPCs voice-acted (the operator, 2026-11-20): a GM or narrator line read as a cast. Narration is
 * read in the narrator's voice, and each quoted speech in the voice of the NPC who says it, named
 * beside the quote the way prose names a speaker: `Mira says, "…"`, `"…," says Mira`,
 * `Mira: "…"`. A quote no one is named for continues the last speaker in the same paragraph, or
 * falls to `quoted`: the narrator for the GM's lines, the character for their own reply ("Not
 * here," she whispers). A character's reply is read the same way (the operator, 2026-11-20).
 */

export interface VoicePart {
  /** The NPC who says it, as the cast names them; null for the narrator. */
  speaker: string | null;
  text: string;
}

const QUOTE = /"([^"\n]+)"|“([^”\n]+)”/g;

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The cast names a stretch of prose mentions, with where each mention ends, in order. */
function mentions(text: string, names: readonly string[]): { name: string; at: number; end: number }[] {
  const found: { name: string; at: number; end: number }[] = [];
  for (const name of names) {
    if (name.trim() === '') continue;
    for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, 'giu'))) {
      found.push({ name, at: match.index, end: match.index + match[0].length });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** The last sentence of `text` (what leads into a quote). */
const lastSentence = (text: string): string =>
  text
    .trimEnd()
    .split(/(?<=[.!?…])\s+|\n/)
    .at(-1) ?? '';
/** The first sentence of `text` (what follows a quote: `"…," says Mira.`). */
const firstSentence = (text: string): string => text.trimStart().split(/(?<=[.!?…])\s+|\n/)[0] ?? '';

/** A GM or narrator line as parts, each to be read in its own voice. */
export function voiceParts(text: string, castNames: readonly string[], quoted: string | null = null): VoicePart[] {
  const parts: VoicePart[] = [];
  const add = (speaker: string | null, piece: string): void => {
    const trimmed = piece.trim();
    if (trimmed === '') return;
    const last = parts.at(-1);
    if (last !== undefined && last.speaker === speaker) last.text = `${last.text} ${trimmed}`;
    else parts.push({ speaker, text: trimmed });
  };
  const quotes = [...text.matchAll(QUOTE)];
  let at = 0;
  let previous: string | null = null;
  quotes.forEach((quote, index) => {
    const start = quote.index;
    const lead = text.slice(at, start);
    const nextStart = quotes[index + 1]?.index ?? text.length;
    const tail = text.slice(start + quote[0].length, nextStart);
    if (lead.includes('\n\n')) previous = null;
    const before = mentions(lastSentence(lead), castNames).at(-1)?.name;
    const after = mentions(firstSentence(tail), castNames)[0]?.name;
    const speaker = before ?? after ?? previous ?? quoted;
    add(null, lead);
    add(speaker, quote[1] ?? quote[2] ?? '');
    previous = speaker;
    at = start + quote[0].length;
  });
  add(null, text.slice(at));
  return parts;
}
