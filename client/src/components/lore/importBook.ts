// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Creates a lorebook and its entries from an imported SillyTavern book, one entry after another
 * (so the server's per-book limit and order hold), through whatever create calls it is given.
 */
import type { EntryFields, ImportedLorebook } from '~/features/import/stLorebook';

export interface BookWriters {
  createBook(fields: { name: string; description: string }): Promise<{ id: string }>;
  createEntry(fields: EntryFields & { lorebook_id: string }): Promise<unknown>;
}

export async function writeImportedBook(book: ImportedLorebook, writers: BookWriters): Promise<{ id: string; entries: number }> {
  const created = await writers.createBook({ name: book.name, description: book.description });
  await book.entries.reduce<Promise<unknown>>(
    (previous, entry) => previous.then(() => writers.createEntry({ ...entry, lorebook_id: created.id })),
    Promise.resolve(),
  );
  return { id: created.id, entries: book.entries.length };
}
