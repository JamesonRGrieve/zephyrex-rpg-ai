// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/party-cases.json';
import { type PartyEntity, oneLine, partyBriefing, partyOf, partyText } from './party';

const entities = cases.entities as PartyEntity[];

describe('the party cases both twins run', () => {
  it.each(cases.party_cases)('$name', (one) => {
    const from = 'entities' in one ? (one.entities as PartyEntity[]) : entities;
    expect(partyOf(from, one.cast, one.seated)).toEqual(one.party);
  });
  it('reads the shared briefing, never a GM-only journal', () => {
    expect(partyBriefing(entities)).toEqual(cases.briefing);
  });
  it.each(cases.text_cases)('$name', ({ speaker, text }) => {
    const party = partyOf(entities, cases.party_cases[0]?.cast ?? [], cases.party_cases[0]?.seated ?? null);
    expect(partyText(party, speaker, entities, cases.briefing)).toBe(text);
  });
  it.each(cases.line_cases)('one line of "$summary"', ({ summary, line }) => {
    expect(oneLine(summary)).toBe(line);
  });
});
