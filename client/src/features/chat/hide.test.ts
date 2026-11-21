// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readByModel, toggled } from './hide';

const BRANCH = [{ id: 'm0', hidden: false }, { id: 'm1', hidden: true }, { id: 'm2' }, { id: 'm3', x_carded: true }];

describe('readByModel', () => {
  it('reads a line unless the person hid it or it was X-carded', () => {
    expect(BRANCH.map(readByModel)).toEqual([true, false, true, false]);
  });
});

describe('toggled', () => {
  it('names the lines a range hides, skipping those already hidden', () => {
    expect(toggled(BRANCH, '0-2', true).map((message) => message.id)).toEqual(['m0', 'm2']);
  });

  it('names the hidden lines a range shows again', () => {
    expect(toggled(BRANCH, '0-3', false).map((message) => message.id)).toEqual(['m1']);
    expect(toggled(BRANCH, '-1', true).map((message) => message.id)).toEqual(['m3']);
  });

  it('names nothing for an empty or unreadable range', () => {
    expect(toggled(BRANCH, '', true)).toEqual([]);
    expect(toggled(BRANCH, 'all', true)).toEqual([]);
  });
});
