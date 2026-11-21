// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The narrator's small markup (the operator, 2026-11-21: "different styling for rendering the screens
 * of cogitators/data slates. And custom styling at model discretion"): a device's display as a block,
 * `[screen: Cogitator]` … `[/screen]`, and colour from a fixed palette inline, `[red]…[/red]`. Pure;
 * nothing is ever injected as HTML, and no colour outside the palette is honoured.
 */

export const PALETTE = ['red', 'amber', 'green', 'blue', 'gold', 'grey'] as const;
export type Colour = (typeof PALETTE)[number];

export type Block = { kind: 'text'; text: string } | { kind: 'screen'; title: string; text: string };
export type Span = { colour: Colour | null; text: string };

const SCREEN = /\[screen(?::\s*([^\]\n]*))?\]\n?([\s\S]*?)(?:\n?\[\/screen\]|$)/gi;
const COLOUR = new RegExp(`\\[(${PALETTE.join('|')})\\]([\\s\\S]*?)\\[\\/\\1\\]`, 'gi');

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
  return blocks.filter((block) => block.kind === 'screen' || block.text !== '');
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
  return text
    .replace(/\[screen(?::[^\]\n]*)?\]\n?/gi, '')
    .replace(/\n?\[\/screen\]/gi, '')
    .replace(COLOUR, '$2');
}
