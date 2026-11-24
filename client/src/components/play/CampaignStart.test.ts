// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/features/data/records', () => ({}));
vi.mock('~/features/data/playRecords', () => ({}));
vi.mock('~/features/data/cast', () => ({ PARTY_TAG: 'PC', useCast: () => ({}) }));
vi.mock('@zephyrex-rpg/wiki/features/data/records', () => ({}));
vi.mock('zephyrex', () => ({ useClient: () => ({}) }));
vi.mock('../characters/CharacterTile', () => ({ initials: () => '' }));

const { defaultParty, remapChoice, splitBanner, startTitle, PARTY_TAG } = await import('./CampaignStart');

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

describe('remapChoice', () => {
  it('the seat and party move to the playthrough copies; an unmapped id stays', () => {
    const map = { a: 'a2', b: 'b2' };
    expect(remapChoice({ seat: 'player', playing: 'a', party: ['b', 'c'] }, map)).toEqual({
      seat: 'player',
      playing: 'a2',
      party: ['b2', 'c'],
    });
    expect(remapChoice({ seat: 'gm', playing: null, party: [] }, map)).toEqual({ seat: 'gm', playing: null, party: [] });
  });
});

describe('splitBanner', () => {
  it("parts the opening's banner from its story, so the banner is its own record", () => {
    expect(splitBanner('[location: Saltmere]\n\nFog rolls in.')).toEqual(['[location: Saltmere]', 'Fog rolls in.']);
    expect(splitBanner('Fog rolls in.')).toEqual([null, 'Fog rolls in.']);
  });
});
