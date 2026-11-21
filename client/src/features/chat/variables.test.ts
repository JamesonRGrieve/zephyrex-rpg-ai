// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sameVariables } from './variables';

describe('sameVariables', () => {
  it('is true only for the same names with the same values', () => {
    expect(sameVariables({}, {})).toBe(true);
    expect(sameVariables({ hp: '3', door: 'open' }, { door: 'open', hp: '3' })).toBe(true);
    expect(sameVariables({ hp: '3' }, { hp: '4' })).toBe(false);
    expect(sameVariables({ hp: '3' }, { hp: '3', door: 'open' })).toBe(false);
    expect(sameVariables({ hp: '' }, {})).toBe(false);
  });
});
