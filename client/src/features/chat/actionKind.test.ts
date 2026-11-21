// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionKind } from './actionKind';

describe('actionKind', () => {
  it('reads the action from its words', () => {
    expect(actionKind('punches the Neverborn.')).toBe('attack');
    expect(actionKind('tries to slice the door cogitator.')).toBe('tech');
    expect(actionKind('charges down the stairs.')).toBe('attack');
    expect(actionKind('sneaks past the guard.')).toBe('stealth');
    expect(actionKind('searches the body.')).toBe('search');
    expect(actionKind('tries to persuade the captain.')).toBe('social');
    expect(actionKind('climbs the ladder.')).toBe('move');
    expect(actionKind('reloads her laspistol.')).toBe('use');
    expect(actionKind('waits.')).toBe('other');
  });
});
