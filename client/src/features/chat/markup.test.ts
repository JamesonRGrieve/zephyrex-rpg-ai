// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { colourSpans, locationBlocks, screenBlocks, stripMarkup } from './markup';

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
  it('a change of place is a block of its own, marked or as a heading', () => {
    expect(locationBlocks('[location: The Rusty Tankard]\nSmoke hangs low.')).toEqual([
      { kind: 'location', name: 'The Rusty Tankard' },
      { kind: 'text', text: 'Smoke hangs low.' },
    ]);
    expect(locationBlocks('## The Cellar\nDark.')[0]).toEqual({ kind: 'location', name: 'The Cellar' });
    expect(locationBlocks('She says **no** to him.')).toEqual([{ kind: 'text', text: 'She says **no** to him.' }]);
  });
});
