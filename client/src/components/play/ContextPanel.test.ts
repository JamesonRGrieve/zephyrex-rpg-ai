// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@zephyrex/vtt-play', () => ({ CharacterSheet: () => null, DiceTray: () => null }));

const { whereabouts } = await import('./ContextPanel');

const cast = [
  { id: 'seat', name: 'Tessaly Kord', line: '' },
  { id: 'osk', name: 'Osk Halleran', line: '' },
  { id: 'rask', name: 'Rask', line: '' },
];
const entities = [
  { id: 'ship', kind: 'location', name: 'The Penitent Lantern', parent_id: null },
  { id: 'deckc', kind: 'location', name: 'Pilgrim Deck C', parent_id: 'ship' },
  { id: 'brig', kind: 'location', name: 'The Brig', parent_id: 'ship' },
  { id: 'seat', kind: 'person', name: 'Tessaly Kord', location_id: 'deckc' },
  { id: 'osk', kind: 'person', name: 'Osk Halleran', location_id: 'deckc' },
  { id: 'rask', kind: 'person', name: 'Rask', location_id: 'brig' },
];

describe('whereabouts', () => {
  it('the seat and whoever shares its place are here; the rest are elsewhere, with their place', () => {
    const { here, away } = whereabouts(cast, 'seat', entities, []);
    expect(here.map((one) => one.id)).toEqual(['seat', 'osk']);
    expect(away.map((one) => [one.member.id, one.place])).toEqual([['rask', 'The Brig']]);
  });
  it('with no places known, the story decides who is here', () => {
    const { here } = whereabouts(cast, 'seat', [], [{ speaker_id: 'rask', text: 'Up, both of you.' }]);
    expect(here.map((one) => one.id)).toEqual(['seat', 'rask']);
  });
});
