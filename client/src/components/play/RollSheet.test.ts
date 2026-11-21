// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@zephyrex/vtt-play', () => ({ DiceTray: () => null }));

const { rollLine } = await import('./RollSheet');

describe('rollLine', () => {
  it('a formula: who rolled it and the total', () => {
    expect(rollLine('Sister Venn', { formula: '2d10+3', total: 14 } as never)).toBe('Sister Venn rolls 2d10+3: 14.');
  });

  it('a test: success or failure, the roll against its target, and the degrees', () => {
    const test = { success: true, roll: 23, target: 41, degrees: 2, natural: null, steps: [] };
    expect(rollLine('Gus', test as never)).toBe('Gus succeeds: rolled 23 against 41, 2 degrees.');
    expect(rollLine('Gus', { ...test, success: false, roll: 100, degrees: 1, natural: 'failure' } as never)).toBe(
      'Gus fails: rolled 100 against 41, 1 degree, a natural 100.',
    );
  });
});
