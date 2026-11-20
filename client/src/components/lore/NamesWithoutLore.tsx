// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Names in play with no lore (AP9): each name the story keeps using that no character, persona or
 * lore entry covers, with a stub entry one tap away (keyed on the name, to be filled in later).
 */
import { BookPlus } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { WriteProblem } from '~/components/common/WriteProblem';

export function NamesWithoutLore({
  names,
  books,
  onAdd,
}: {
  names: readonly string[];
  /** Where a stub can go: the lorebooks, the chat's own first. */
  books: readonly { id: string; name: string }[];
  /** Adds a stub entry for `name` to the book; answers the problem, or null. */
  onAdd: (name: string, bookId: string) => Promise<string | null>;
}): ReactElement {
  const [bookId, setBookId] = useState(books[0]?.id ?? '');
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const bookPicker = useId();

  if (names.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        Every name in play so far has a character, a persona or lore behind it.
      </p>
    );
  }
  if (books.length === 0) {
    return (
      <div className='grid gap-2 text-sm'>
        <p>{names.join(', ')}</p>
        <p className='text-muted-foreground'>Make a lorebook first to keep notes on them.</p>
      </div>
    );
  }
  return (
    <div className='grid gap-3'>
      <div className='grid gap-1.5'>
        <label htmlFor={bookPicker} className='text-sm font-medium'>
          Add stubs to
        </label>
        <select
          id={bookPicker}
          value={bookId}
          className='h-11 rounded-md border bg-background px-3 text-sm'
          onChange={(event) => setBookId(event.target.value)}
        >
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
      </div>
      <ul className='divide-y rounded-xl border' aria-label='Names without lore'>
        {names.map((name) => (
          <li key={name} className='flex min-h-12 items-center justify-between gap-3 px-3'>
            <span>{name}</span>
            {added.has(name) ? (
              <span className='text-sm text-muted-foreground'>Stub added</span>
            ) : (
              <Button
                type='button'
                variant='outline'
                className='h-11'
                aria-label={`Add a stub for ${name}`}
                onClick={() =>
                  void onAdd(name, bookId).then((failed) => {
                    setProblem(failed);
                    if (failed === null) setAdded(new Set([...added, name]));
                  })
                }
              >
                <BookPlus aria-hidden /> Add a stub
              </Button>
            )}
          </li>
        ))}
      </ul>
      <WriteProblem problem={problem} />
    </div>
  );
}
