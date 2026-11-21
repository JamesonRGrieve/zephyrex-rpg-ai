// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { seatGroups, seatOrder } from './SeatPicker';

describe('seatOrder', () => {
  it('lists the party first, then everyone else, each once', () => {
    const party = [{ id: 'b' }, { id: 'a' }];
    const everyone = [{ id: 'a' }, { id: 'c' }, { id: 'b' }, { id: 'd' }];
    expect(seatOrder(party, everyone).map((one) => one.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('seatGroups', () => {
  it('player characters first, then NPCs, each in seat order; an empty group is left out', () => {
    const seats = [
      { id: 'npc1', pc: false },
      { id: 'pc1', pc: true },
      { id: 'npc2' },
      { id: 'pc2', pc: true },
    ];
    expect(seatGroups(seats).map((group) => [group.label, group.members.map((one) => one.id)])).toEqual([
      ['Player characters', ['pc1', 'pc2']],
      ['NPCs', ['npc1', 'npc2']],
    ]);
    expect(seatGroups([{ id: 'x', pc: true }]).map((group) => group.label)).toEqual(['Player characters']);
  });
});
