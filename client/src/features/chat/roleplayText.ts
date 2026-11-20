// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A message's text in the pieces it is shown in, the way roleplay is written: `*actions*` in
 * italics, `"speech"` and “speech” set apart, everything else plain. Pure, so the renderer is a
 * plain map over pieces and nothing is ever injected as HTML.
 */

export type TextPiece = { kind: 'plain' | 'action' | 'speech'; text: string };

const PATTERN = /(\*[^*\n]+\*)|("[^"\n]+")|(“[^”\n]+”)/g;

export function roleplayPieces(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index;
    if (start > at) pieces.push({ kind: 'plain', text: text.slice(at, start) });
    const found = match[0];
    pieces.push(found.startsWith('*') ? { kind: 'action', text: found.slice(1, -1) } : { kind: 'speech', text: found });
    at = start + found.length;
  }
  if (at < text.length) pieces.push({ kind: 'plain', text: text.slice(at) });
  return pieces;
}
