// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { branchTo, treeRows, childrenOf, latestLeaf } from './branch';

// a ─ b ─ c
//      └─ d ─ e
const TREE = [
  { id: 'a', parent_id: null },
  { id: 'b', parent_id: 'a' },
  { id: 'c', parent_id: 'b' },
  { id: 'd', parent_id: 'b' },
  { id: 'e', parent_id: 'd' },
];

describe('branch', () => {
  it('walks from the root to a leaf', () => {
    expect(branchTo(TREE, 'c').map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(branchTo(TREE, 'e').map((m) => m.id)).toEqual(['a', 'b', 'd', 'e']);
    expect(branchTo(TREE, 'missing')).toEqual([]);
  });

  it('stops on a cycle instead of looping', () => {
    const cycle = [
      { id: 'x', parent_id: 'y' },
      { id: 'y', parent_id: 'x' },
    ];
    expect(branchTo(cycle, 'x').map((m) => m.id)).toEqual(['y', 'x']);
  });

  it('lists a fork and opens on the newest leaf', () => {
    expect(childrenOf(TREE, 'b').map((m) => m.id)).toEqual(['c', 'd']);
    expect(latestLeaf(TREE)?.id).toBe('e');
    expect(latestLeaf(TREE, 'c')?.id).toBe('c');
    expect(latestLeaf([])).toBeUndefined();
  });
});

describe('treeRows', () => {
  it('lists the tree depth first, deeper only at forks, marking the shown branch and its ends', () => {
    const messages = [
      { id: 'a', parent_id: null },
      { id: 'b', parent_id: 'a' },
      { id: 'c1', parent_id: 'b' },
      { id: 'c2', parent_id: 'b' },
      { id: 'd', parent_id: 'c2' },
    ];
    expect(treeRows(messages, new Set(['a', 'b', 'c2', 'd'])).map((row) => [row.message.id, row.depth, row.onPath, row.leaf])).toEqual([
      ['a', 0, true, false],
      ['b', 0, true, false],
      ['c1', 1, false, true],
      ['c2', 1, true, false],
      ['d', 1, true, true],
    ]);
  });
});

