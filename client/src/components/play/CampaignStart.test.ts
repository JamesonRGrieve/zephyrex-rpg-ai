// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/features/data/records', () => ({}));
vi.mock('~/features/data/playRecords', () => ({}));
vi.mock('~/features/data/cast', () => ({ PARTY_TAG: 'PC', useCast: () => ({}) }));
vi.mock('@zephyrex-rpg/wiki/features/data/records', () => ({}));
vi.mock('../characters/CharacterTile', () => ({ initials: () => '' }));

const { defaultParty, startTitle, PARTY_TAG } = await import('./CampaignStart');

const CAST = [
  { id: 'a', tags: [PARTY_TAG] },
  { id: 'b', tags: ['NPC'] },
  { id: 'c', tags: [PARTY_TAG, 'Navy'] },
];

describe('defaultParty', () => {
  it('is the player characters', () => {
    expect(defaultParty(CAST, null)).toEqual(['a', 'c']);
  });

  it('leaves out the one the person plays', () => {
    expect(defaultParty(CAST, 'a')).toEqual(['c']);
    expect(defaultParty(CAST, 'b')).toEqual(['a', 'c']);
  });
});

describe('startTitle', () => {
  it('names the campaign and the seat', () => {
    expect(startTitle('Solenne', null)).toBe('Solenne: you are the GM');
    expect(startTitle('Solenne', 'Gus Veridan')).toBe('Solenne: you play Gus Veridan');
  });
});
