// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The data bank (A41): documents a chat, a character or everyone can draw on, retrieved by the
 * words the story is using. Pure, and held to contract/databank-cases.json, which the SaaS
 * server's DataBank.py runs too.
 *
 * 1. **Chunks:** a document is cut at blank lines into paragraphs, and paragraphs are joined (with
 *    a blank line) while the chunk stays within `chunk_characters`; a paragraph longer than that is
 *    cut into pieces of that many characters (counted as code points).
 * 2. **Words:** lower-cased runs of letters and digits, at least `min_word_characters` long, less
 *    the contract's stop words.
 * 3. **Score:** how many distinct words of the last `scan_turns` story turns a chunk contains. The
 *    `chunks` best with a score above zero are kept, the earlier on a tie, and returned in their
 *    documents' order. Integers only, so both languages always agree.
 */
import { DATA_BANK } from '~/contract';

const STOP = new Set<string>(DATA_BANK.stop_words);
const WORD = /[\p{L}\p{N}]+/gu;
const BREAK = /\n\s*\n/;

/** Code-point length and slicing, as Python counts. */
const points = (text: string) => Array.from(text);

export function chunksOf(text: string): string[] {
  const limit = DATA_BANK.chunk_characters;
  const pieces = text
    .split(BREAK)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .flatMap((paragraph) => {
      const all = points(paragraph);
      return Array.from({ length: Math.ceil(all.length / limit) }, (_unused, index) =>
        all.slice(index * limit, (index + 1) * limit).join(''),
      );
    });
  return pieces.reduce<string[]>((chunks, piece) => {
    const last = chunks.at(-1);
    if (last !== undefined && points(last).length + 2 + points(piece).length <= limit)
      return [...chunks.slice(0, -1), `${last}\n\n${piece}`];
    return [...chunks, piece];
  }, []);
}

export function wordsOf(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(WORD) ?? []).filter(
      (word) => points(word).length >= DATA_BANK.min_word_characters && !STOP.has(word),
    ),
  );
}

/** The chunks of `documents` most about the last turns of `story`, in document order. */
export function retrieve(documents: readonly string[], story: readonly string[]): string[] {
  const wanted = wordsOf(story.slice(-DATA_BANK.scan_turns).join('\n'));
  if (wanted.size === 0) return [];
  const scored = documents
    .flatMap((document) => chunksOf(document))
    .map((chunk, order) => ({ chunk, order, score: [...wordsOf(chunk)].filter((word) => wanted.has(word)).length }));
  const best = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, DATA_BANK.chunks);
  return best.sort((a, b) => a.order - b.order).map((entry) => entry.chunk);
}

/** The prompt section: the retrieved chunks under the contract's prefix, or nothing. */
export function dataBankText(documents: readonly string[], story: readonly string[]): string {
  const found = retrieve(documents, story);
  return found.length === 0 ? '' : DATA_BANK.prefix + found.join('\n\n');
}
