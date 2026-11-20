// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Names that come up in play with no lore behind them (AP9): runs of capitalised words in the
 * story, seen at least `minimum` times, that no character, persona or lore entry already covers.
 * A word that only ever starts a sentence is not a name ("The", "When"). Pure.
 */

const WORD = /[\p{L}][\p{L}'’-]*/gu;
const SENTENCES = /(?<=[.!?…])\s+|\n+/u;

const capitalised = (word: string) => /^\p{Lu}/u.test(word) && word.length > 1;

/** Each run of capitalised words in a sentence, and whether it starts the sentence. */
function runs(sentence: string): { name: string; first: boolean }[] {
  const words = [...sentence.matchAll(WORD)].map((match) => match[0]);
  const found: { name: string; first: boolean }[] = [];
  let run: string[] = [];
  let start = 0;
  words.forEach((word, index) => {
    if (capitalised(word)) {
      if (run.length === 0) start = index;
      run.push(word);
    }
    if (!capitalised(word) || index === words.length - 1) {
      if (run.length > 0) {
        found.push({ name: run.join(' '), first: start === 0 });
        // "Then Cy …": a run that starts the sentence may begin with an ordinary word, so what
        // follows its first word is counted too, as a name met mid-sentence.
        if (start === 0 && run.length > 1) found.push({ name: run.slice(1).join(' '), first: false });
      }
      run = [];
    }
  });
  return found;
}

export function namesWithoutLore(texts: readonly string[], known: readonly string[], minimum = 2): string[] {
  const knownWords = new Set(
    known
      .flatMap((name) => [name, ...name.split(/\s+/)])
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
  const counts = new Map<string, { mid: number; all: number }>();
  for (const text of texts) {
    for (const sentence of text.split(SENTENCES)) {
      for (const { name, first } of runs(sentence)) {
        if (knownWords.has(name.toLowerCase())) continue;
        const count = counts.get(name) ?? { mid: 0, all: 0 };
        counts.set(name, { mid: count.mid + (first ? 0 : 1), all: count.all + 1 });
      }
    }
  }
  return [...counts]
    .filter(([, count]) => count.mid > 0 && count.all >= minimum)
    .sort(([a, x], [b, y]) => y.all - x.all || a.localeCompare(b))
    .map(([name]) => name);
}
