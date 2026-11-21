// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { seatOrder } from './SeatPicker';

describe('seatOrder', () => {
  it('lists the party first, then everyone else, each once', () => {
    const party = [{ id: 'b' }, { id: 'a' }];
    const everyone = [{ id: 'a' }, { id: 'c' }, { id: 'b' }, { id: 'd' }];
    expect(seatOrder(party, everyone).map((one) => one.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});
