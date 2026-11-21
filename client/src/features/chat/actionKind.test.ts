// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionKind } from './actionKind';

describe('actionKind', () => {
  it('reads the action from its words, most specific first', () => {
    expect(actionKind('Pisses in the middle of the floor')).toBe('relieve');
    expect(actionKind('downs the last of her ale in one long drink')).toBe('drink');
    expect(actionKind('punches the Neverborn.')).toBe('attack');
    expect(actionKind('fires her laspistol at the cultist.')).toBe('shoot');
    expect(actionKind('tries to slice the door cogitator.')).toBe('hack');
    expect(actionKind('charges down the stairs.')).toBe('move');
    expect(actionKind('sneaks past the guard.')).toBe('stealth');
    expect(actionKind('searches the body.')).toBe('search');
    expect(actionKind('chuckles and walks towards the door')).toBe('laugh');
    expect(actionKind('kneels and prays to the Emperor.')).toBe('pray');
    expect(actionKind('casts a fireball.')).toBe('spell');
    expect(actionKind('picks the lock.')).toBe('unlock');
    expect(actionKind('pays the barkeep.')).toBe('pay');
    expect(actionKind('waits.')).toBe('other');
  });
});
