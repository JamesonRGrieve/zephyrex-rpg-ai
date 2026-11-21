// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isFraming, openingLine, sectionText } from './framing';

const plate = JSON.stringify([
  { type: 'h1', children: [{ text: 'Mesphos Primus: Campaign Framing' }] },
  { type: 'h2', children: [{ text: 'Premise' }] },
  { type: 'p', children: [{ text: 'An Inquisitor Lord arrives undercover.' }] },
  { type: 'h2', children: [{ text: 'Opening Situation' }] },
  { type: 'p', children: [{ text: 'The shuttle sets down at ' }, { type: 'a', children: [{ text: 'Hive Mesphos' }] }, { text: '.' }] },
  { type: 'p', children: [{ text: 'Rain hammers the pad.' }] },
  { type: 'h2', children: [{ text: 'Truths' }] },
  { type: 'p', children: [{ text: 'Secret.' }] },
]);

describe('sectionText', () => {
  it('the text under the heading, up to the next one at its level, links flattened', () => {
    expect(sectionText(plate, 'Opening Situation')).toBe('The shuttle sets down at Hive Mesphos.\n\nRain hammers the pad.');
  });
  it('nothing for a missing section or an unreadable entry', () => {
    expect(sectionText(plate, 'Hooks')).toBe('');
    expect(sectionText('not json', 'Premise')).toBe('');
    expect(sectionText(null, 'Premise')).toBe('');
  });
});

describe('isFraming', () => {
  it('by kind, or by the vaults title imported as lore', () => {
    expect(isFraming({ kind: 'campaign_framing', name: 'Anything' })).toBe(true);
    expect(isFraming({ kind: 'lore', name: 'Mesphos Primus: Campaign Framing' })).toBe(true);
    expect(isFraming({ kind: 'lore', name: 'The Truth of the Twofold Star' })).toBe(false);
  });
});

describe('openingLine', () => {
  const campaign = { name: 'Mesphos Primus', description: 'A choir has gone quiet.' };
  it('the framing note’s Opening Situation first', () => {
    expect(openingLine(campaign, [{ kind: 'lore', name: 'Mesphos Primus: Campaign Framing', entry: plate }])).toMatch(
      /^The shuttle sets down/,
    );
  });
  it('else the description, else a default', () => {
    expect(openingLine(campaign, [])).toBe('A choir has gone quiet.');
    expect(openingLine({ name: 'Voidship', description: null }, [])).toBe('Voidship begins.');
  });
});
