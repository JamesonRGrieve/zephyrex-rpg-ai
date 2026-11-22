// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CastEntity } from '~/features/prompt/worldCast';
import type { PromptTurn } from '~/features/prompt/assemble';
import { presentPeople } from './generate';

describe('who is present (the operator, 2026-11-22: a "cloud giant" offered in a tavern)', () => {
  it('counts the campaign’s people and never a setting’s canon', () => {
    const world = [
      { id: 'inn', kind: 'location', name: "The River's Rest", deleted: false },
      { id: 'bar', kind: 'person', name: 'The Barkeep', deleted: false, location_id: 'inn' },
      { id: 'pri', kind: 'person', name: 'The Priest', deleted: false, location_id: 'inn' },
      { id: 'giant', kind: 'person', name: 'Cloud Giant', deleted: false, canon: true },
    ] as unknown as CastEntity[];
    const turns = [
      { role: 'user', speaker_character_id: null, content: "At The River's Rest, a cloud giant story.", channel: 'ic' },
    ] as unknown as PromptTurn[];
    const present = presentPeople(world, 'fen', turns, []).map((one) => one.id);
    expect(present).not.toContain('giant');
    expect(new Set(present)).toEqual(new Set(['bar', 'pri']));
  });
});
