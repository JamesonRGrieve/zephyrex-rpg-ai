// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The narrator's small markup (the operator, 2026-11-21: "different styling for rendering the screens
 * of cogitators/data slates. And custom styling at model discretion"): a device's display as a block,
 * `[screen: Cogitator]` … `[/screen]`, and colour from a fixed palette inline, `[red]…[/red]`. Pure;
 * nothing is ever injected as HTML, and no colour outside the palette is honoured.
 */

export const PALETTE = ['red', 'amber', 'green', 'blue', 'gold', 'grey'] as const;
export type Colour = (typeof PALETTE)[number];

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'screen'; title: string; text: string }
  | { kind: 'location'; name: string; within?: string };
export type Span = { colour: Colour | null; text: string };

const SCREEN = /\[screen(?::\s*([^\]\n]*))?\]\n?([\s\S]*?)(?:\n?\[\/screen\]|$)/gi;
const COLOUR = new RegExp(`\\[(${PALETTE.join('|')})\\]([\\s\\S]*?)\\[\\/\\1\\]`, 'gi');

/**
 * A change of place, as the narrator marks it (`[location: The Rusty Tankard]`) or as a heading on a
 * line of its own (`## The Rusty Tankard`, `**The Rusty Tankard**`): shown as a banner, never as a
 * plain title (the operator, 2026-11-21).
 */
const LOCATION = /^\s*\[location:\s*([^\]\n]+)\]\s*$/i;
// A lone heading the model writes is no change of place (the map step decides that): it's dropped.
const HEADING = /^\s*(?:#{1,6}\s+[^\n]+?|\*\*[^*\n]{2,80}\*\*)\s*$/;

export function locationBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.join('\n').trim() !== '') blocks.push({ kind: 'text', text: buffer.join('\n') });
    buffer = [];
  };
  for (const line of text.split('\n')) {
    if (HEADING.test(line)) continue;
    const found = LOCATION.exec(line);
    if (found === null) {
      buffer.push(line);
      continue;
    }
    flush();
    // `[location: The Leaning Lantern | Harrowgate, the Saltmarsh Reach]`: the place, then where it is.
    const [place = '', within = ''] = (found[1] ?? '').split('|').map((part) => part.trim());
    blocks.push(within === '' ? { kind: 'location', name: place } : { kind: 'location', name: place, within });
  }
  flush();
  return blocks;
}

/** The text in blocks: screens apart, the rest as text. An unclosed screen runs to the end. */
export function screenBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let at = 0;
  for (const match of text.matchAll(SCREEN)) {
    if (match.index > at) blocks.push({ kind: 'text', text: text.slice(at, match.index) });
    blocks.push({ kind: 'screen', title: (match[1] ?? '').trim() || 'Display', text: (match[2] ?? '').replace(/\n+$/, '') });
    at = match.index + match[0].length;
  }
  if (at < text.length) blocks.push({ kind: 'text', text: text.slice(at) });
  return blocks.filter((block) => block.kind !== 'text' || block.text !== '');
}

/** The text in spans: each palette colour's run apart, the rest plain. */
export function colourSpans(text: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const match of text.matchAll(COLOUR)) {
    if (match.index > at) spans.push({ colour: null, text: text.slice(at, match.index) });
    spans.push({ colour: (match[1] ?? '').toLowerCase() as Colour, text: match[2] ?? '' });
    at = match.index + match[0].length;
  }
  if (at < text.length) spans.push({ colour: null, text: text.slice(at) });
  return spans;
}

/** The text with the markup taken out, for speech and summaries. */
export function stripMarkup(text: string): string {
  return (
    text
      // A banner reads as its place, then where it is: "The Leaning Lantern. Harrowgate." (never a bar).
      .replace(/^\s*\[location:\s*([^\]\n]+)\]\s*$/gim, (_whole, inner: string) =>
        inner
          .split('|')
          .map((part) => part.trim())
          .filter((part) => part !== '')
          .join('. ')
          .concat('.'),
      )
      .replace(/\[screen(?::[^\]\n]*)?\]\n?/gi, '')
      .replace(/\n?\[\/screen\]/gi, '')
      .replace(COLOUR, '$2')
  );
}
