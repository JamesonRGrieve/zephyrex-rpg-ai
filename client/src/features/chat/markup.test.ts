// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { colourSpans, screenBlocks, stripMarkup } from './markup';

describe('the narrator markup', () => {
  it('a screen is its own block, titled', () => {
    expect(
      screenBlocks(
        'She turns the slate.\n[screen: Data-slate]\nDECK C: 41 SOULS\nSTATUS: CRITICAL\n[/screen]\nHer face goes pale.',
      ),
    ).toEqual([
      { kind: 'text', text: 'She turns the slate.\n' },
      { kind: 'screen', title: 'Data-slate', text: 'DECK C: 41 SOULS\nSTATUS: CRITICAL' },
      { kind: 'text', text: '\nHer face goes pale.' },
    ]);
  });
  it('an unclosed screen runs to the end; an untitled one is a Display', () => {
    expect(screenBlocks('[screen]\nERROR')).toEqual([{ kind: 'screen', title: 'Display', text: 'ERROR' }]);
  });
  it('palette colours only; anything else stays text', () => {
    expect(colourSpans('Status: [red]CRITICAL[/red], [pink]x[/pink].')).toEqual([
      { colour: null, text: 'Status: ' },
      { colour: 'red', text: 'CRITICAL' },
      { colour: null, text: ', [pink]x[/pink].' },
    ]);
  });
  it('strips for speech and summaries', () => {
    expect(stripMarkup('[screen: Auspex]\n[amber]CONTACT[/amber]\n[/screen]')).toBe('CONTACT');
  });
});
