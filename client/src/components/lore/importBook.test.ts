// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BLANK_ENTRY } from './fixtures';
import { writeImportedBook } from './importBook';

describe('writeImportedBook', () => {
  it('creates the book, then each entry in order, in that book', async () => {
    const written: string[] = [];
    const result = await writeImportedBook(
      { name: 'Kestrel', description: '', entries: [{ ...BLANK_ENTRY, comment: 'one' }, { ...BLANK_ENTRY, comment: 'two' }] },
      {
        createBook: async (fields) => {
          written.push(`book ${fields.name}`);
          return { id: 'b1' };
        },
        createEntry: async (fields) => {
          written.push(`entry ${fields.comment} in ${fields.lorebook_id}`);
        },
      },
    );
    expect(result).toEqual({ id: 'b1', entries: 2 });
    expect(written).toEqual(['book Kestrel', 'entry one in b1', 'entry two in b1']);
  });
});
