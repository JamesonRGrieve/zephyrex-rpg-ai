// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./records', () => ({}));
vi.mock('zephyrex', () => ({ useClient: () => ({}) }));
vi.mock('@zephyrex-rpg/wiki/features/data/records', () => ({}));

const { mergeCast, oneLine, PARTY_TAG, personAsCast } = await import('./cast');

const person = (id: string, kind: string, name = id) => ({
  id,
  name,
  description: `${name}, described`,
  kind,
  created_at: '2026-11-21T00:00:00Z',
  updated_at: null,
});

describe('personAsCast', () => {
  it('a player character carries the party tag; anyone else does not', () => {
    expect(personAsCast(person('a', 'pc')).tags).toEqual([PARTY_TAG]);
    expect(personAsCast(person('b', 'npc')).tags).toEqual([]);
  });

  it('keeps the id, name and description, with empty card fields', () => {
    const cast = personAsCast(person('a', 'pc', 'Sister Venn'));
    expect(cast).toMatchObject({ id: 'a', name: 'Sister Venn', description: 'Sister Venn, described', personality: '' });
    expect(personAsCast({ ...person('c', 'npc'), description: null }).description).toBe('');
  });
});

describe('mergeCast', () => {
  it('lists the persons first, then the cards no person shadows', () => {
    const persons = [personAsCast(person('a', 'pc')), personAsCast(person('b', 'npc'))];
    const cards = [personAsCast(person('b', 'npc', 'Old B')), personAsCast(person('c', 'npc'))];
    expect(mergeCast(persons, cards).map((one) => [one.id, one.name])).toEqual([
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
  });
});

describe('oneLine', () => {
  it('the first sentence, without the leading name', () => {
    expect(oneLine('Ilsa Marrow', 'Ilsa Marrow The Mystic. A sanctioned psyker, soul-bound.')).toBe('The Mystic.');
    expect(oneLine('Rook', 'A blunt soldier with a lasgun')).toBe('A blunt soldier with a lasgun');
    expect(oneLine('X', null)).toBe('');
  });
});
