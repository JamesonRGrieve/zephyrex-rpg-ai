// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A character's card as SillyTavern takes it (A2): the V2 card, with the character's own lorebook
 * as its `character_book` when it has one. The editor and the gallery's batch export share it.
 */
import { type CardFields, cardToJson } from './stCard';
import { characterBookFromEntries, type EntryFields } from './stLorebook';

export async function cardWithBook(
  fields: CardFields,
  book: { name: string; description: string } | undefined,
  entriesOf: () => Promise<readonly EntryFields[]>,
): Promise<Record<string, unknown>> {
  const card = cardToJson(fields);
  if (book !== undefined) Reflect.set(Object(card.data), 'character_book', characterBookFromEntries(book, await entriesOf()));
  return card;
}
