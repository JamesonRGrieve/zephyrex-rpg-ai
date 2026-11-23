// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { aiTurn, combatLine, readEncounter } from './combat';

const RAW = {
  id: 'e1',
  status: 'running',
  round: 2,
  current_combatant_id: 'c2',
  combatants: [
    { id: 'c1', name: 'Tam Quickfoot', person_id: 'tam', is_defeated: false },
    { id: 'c2', name: 'Drowned Thing', person_id: 'thing', is_defeated: false },
  ],
};

describe('combat', () => {
  it('reads whose turn it is, and an AI turn is anyone standing who is not the seat', () => {
    const encounter = readEncounter(RAW);
    expect(encounter?.running).toBe(true);
    const notTam = (id: string) => id !== 'tam';
    expect(aiTurn(encounter!, notTam)?.name).toBe('Drowned Thing');
    expect(aiTurn({ ...encounter!, currentId: 'c1' }, notTam)).toBeNull();
  });

  it("states the VTT's result, never inventing one", () => {
    expect(combatLine('Drowned Thing', ['Tam Quickfoot'], { hit: true, roll: 17, damage: 5, target_hp: 3 })).toBe(
      'Drowned Thing attacks Tam Quickfoot (rolled 17): hit, 5 damage; 3 HP left.',
    );
    expect(combatLine('Drowned Thing', ['Tam Quickfoot'], { hit: false, roll: 4 })).toBe(
      'Drowned Thing attacks Tam Quickfoot (rolled 4): miss.',
    );
    expect(combatLine('Drowned Thing', [], null)).toBe('Drowned Thing holds.');
  });
});
