// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import type { Character } from '~/features/data/records';
import { draftOf, entriesOfBook, isChanged } from './CharacterEditor';
import { ADA_DRAFT } from './fixtures';

const SAVED: Character = {
  ...ADA_DRAFT,
  id: 'c-ada',
  created_at: '2026-11-20T00:00:00.000000',
  updated_at: '2026-11-20T00:00:00.000000',
  favourite: false,
  folder: '',
  extensions: {},
  lorebook_id: null,
};

describe('CharacterEditor helpers', () => {
  it('drafts only the card fields', () => {
    expect(draftOf(SAVED)).toEqual(ADA_DRAFT);
  });

  it('sees a change, and none in an untouched draft', () => {
    expect(isChanged(draftOf(SAVED), SAVED)).toBe(false);
    expect(isChanged({ ...draftOf(SAVED), name: 'Ada' }, SAVED)).toBe(true);
  });
});

describe('entriesOfBook', () => {
  it('asks for one lorebook’s entries with the filter as a parameter, not in the path', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const client = { list } as unknown as Parameters<typeof entriesOfBook>[0];
    await entriesOfBook(client, 'book-1');
    expect(list).toHaveBeenCalledWith('/v1/lorebook_entry', 'lorebook_entries', expect.anything(), {
      lorebook_id: 'book-1',
    });
  });
});
