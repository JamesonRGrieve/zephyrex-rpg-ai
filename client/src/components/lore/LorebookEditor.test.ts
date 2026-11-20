// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { LorebookEntry } from '~/features/data/records';
import { SPANNER_ENTRY } from './fixtures';
import { entryFields, entryMatches, entryTitle } from './LorebookEditor';

const STAMP = '2026-11-20T00:00:00.000000';

describe('lorebook editor helpers', () => {
  it('keeps only an entry’s own fields', () => {
    const record: LorebookEntry = { ...SPANNER_ENTRY, id: 'e1', created_at: STAMP, updated_at: STAMP, lorebook_id: 'b1' };
    expect(entryFields(record)).toEqual(SPANNER_ENTRY);
  });

  it('names a row by its label, first key or content', () => {
    expect(entryTitle({ comment: ' Tools ', keys: ['x'], content: '' })).toBe('Tools');
    expect(entryTitle({ comment: '', keys: ['spanner'], content: '' })).toBe('spanner');
    expect(entryTitle({ comment: '', keys: [], content: 'A long piece of lore about the ship and its crew' })).toBe('A long piece of lore about the ship and ');
    expect(entryTitle({ comment: '', keys: [], content: '' })).toBe('Untitled entry');
  });

  it('searches labels, keys and content', () => {
    expect(entryMatches(SPANNER_ENTRY, 'WRENCH')).toBe(true);
    expect(entryMatches(SPANNER_ENTRY, 'kestrel')).toBe(true);
    expect(entryMatches(SPANNER_ENTRY, 'dragon')).toBe(false);
  });
});
