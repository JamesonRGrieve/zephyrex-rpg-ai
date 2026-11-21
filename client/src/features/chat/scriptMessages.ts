// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The branch as STscript's message commands see it (A37): `/messages` reads lines by index, the
 * branch's first line being 0, as SillyTavern counts them. A range is `n`, `a-b` (both ends kept),
 * or a negative `n` counted from the end (`-1` is the last line).
 */

export interface ScriptLine {
  name: string;
  text: string;
}

/** The indexes a range names, within `count` lines; none for a range that isn't one. */
export function rangeIndexes(range: string, count: number): number[] {
  const spec = range.trim();
  if (spec === '') return Array.from({ length: count }, (_, index) => index);
  const single = /^-?\d+$/.test(spec) ? Number(spec) : null;
  if (single !== null) {
    const index = single < 0 ? count + single : single;
    return index >= 0 && index < count ? [index] : [];
  }
  const span = /^(\d+)\s*-\s*(\d+)$/.exec(spec);
  if (span === null) return [];
  const [from, to] = [Number(span[1]), Number(span[2])].sort((a, b) => a - b) as [number, number];
  const indexes: number[] = [];
  for (let index = from; index <= Math.min(to, count - 1); index += 1) indexes.push(index);
  return indexes;
}

/** `/messages`: the lines a range names, one per row, with their speakers unless `names` is off. */
export function messagesText(lines: readonly ScriptLine[], range: string, names: boolean): string {
  return rangeIndexes(range, lines.length)
    .map((index) => lines[index] as ScriptLine)
    .map((line) => (names ? `${line.name}: ${line.text}` : line.text))
    .join('\n');
}

/** `/del n`: how many of the branch's last lines go (1 when no number is given, never more than there are). */
export function deleteCount(text: string, count: number): number {
  const asked = text.trim() === '' ? 1 : Math.floor(Number(text));
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, count) : 0;
}

/** `/cut range`: the branch's lines a range names (none for an empty or unreadable range, never all by default). */
export function cutIndexes(range: string, count: number): number[] {
  return range.trim() === '' ? [] : rangeIndexes(range, count);
}
