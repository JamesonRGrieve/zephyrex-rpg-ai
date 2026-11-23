// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isFraming, openingLine, sectionText } from './framing';

const plate = JSON.stringify([
  { type: 'h1', children: [{ text: 'Mesphos Primus: Campaign Framing' }] },
  { type: 'h2', children: [{ text: 'Premise' }] },
  { type: 'p', children: [{ text: 'An Inquisitor Lord arrives undercover.' }] },
  { type: 'h2', children: [{ text: 'Opening Situation' }] },
  {
    type: 'p',
    children: [{ text: 'The shuttle sets down at ' }, { type: 'a', children: [{ text: 'Hive Mesphos' }] }, { text: '.' }],
  },
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
    expect(openingLine({ name: 'Voidship', description: null }, [])).toBe('');
  });
  it("never a pointer to other notes; the players' briefing first", () => {
    const pointer =
      'See Sullenmire — Player Briefing; the event graph is The Sullenmire Infiltration, and play-by-play is in Sullenmire — Run 1 Record.';
    expect(openingLine({ name: 'Sullenmire', description: pointer }, [])).toBe('');
    const briefing = JSON.stringify([
      { type: 'h1', children: [{ text: 'Sullenmire — Player Briefing' }] },
      { type: 'p', children: [{ text: 'Fog lies on the marsh town of Sullenmire.' }] },
      { type: 'h2', children: [{ text: 'Secrets' }] },
      { type: 'p', children: [{ text: 'The reeve is the smuggler.' }] },
    ]);
    expect(
      openingLine({ name: 'Sullenmire', description: pointer }, [
        { kind: 'lore', name: 'Sullenmire — Player Briefing', entry: briefing },
      ]),
    ).toBe('Fog lies on the marsh town of Sullenmire.');
    expect(
      openingLine({ name: 'Sullenmire', description: pointer }, [
        {
          kind: null,
          name: 'Sullenmire — Player Briefing',
          entry: '# Briefing\n\nFog lies on **Sullenmire**.\n\n## Secrets\n\nThe reeve.',
        },
      ]),
    ).toBe('Fog lies on Sullenmire.');
  });
  it("a repaired framing: the written opening, its Sources line aside; never the briefing's note to the GM", () => {
    const framing = JSON.stringify([
      { type: 'h2', children: [{ text: 'Opening Situation' }] },
      { type: 'p', children: [{ text: 'An Inquisitor Lord steps off a civilian transport.' }] },
      { type: 'p', children: [{ text: 'Sources: See Sullenmire — Player Briefing; the event graph is X.' }] },
    ]);
    const briefing = JSON.stringify([
      { type: 'p', children: [{ text: 'Read or share this before play. A solo one-shot for one player.' }] },
    ]);
    expect(
      openingLine({ name: 'Sullenmire', description: null }, [
        { kind: 'campaign_framing', name: 'Sullenmire: Campaign Framing', entry: framing },
        { kind: null, name: 'Sullenmire — Player Briefing', entry: briefing },
      ]),
    ).toBe('An Inquisitor Lord steps off a civilian transport.');
  });
});
