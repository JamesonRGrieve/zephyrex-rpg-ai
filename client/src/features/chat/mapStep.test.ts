// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { aimAt } from './mapStep';

describe('aimAt', () => {
  it("aims the person's untargeted actions; speech and aimed actions stay", () => {
    expect(
      aimAt(
        ['Tessaly Kord punches it.', 'Tessaly Kord (to everyone): "Die!"', 'Tessaly Kord (at Wren) shoves her aside.'].join(
          '\n',
        ),
        'Tessaly Kord',
        'the Neverborn',
      ),
    ).toBe(
      [
        'Tessaly Kord (at the Neverborn) punches it.',
        'Tessaly Kord (to everyone): "Die!"',
        'Tessaly Kord (at Wren) shoves her aside.',
      ].join('\n'),
    );
  });
});
