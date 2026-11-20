// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every lorebook: open one to edit its entries, start a new one, or import SillyTavern World Info
 * files (several at once; a character card's embedded book is imported with the card itself).
 */
import { BookPlus, FileUp, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type ReactElement, useRef, useState } from 'react';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { lorebookEntries, lorebooks } from '~/features/data/records';
import { lorebookFromJson } from '~/features/import/stLorebook';
import { writeImportedBook } from './importBook';

export function LorebookLibrary(): ReactElement {
  const list = lorebooks.useList();
  const { create, remove } = lorebooks.useActions();
  const { create: createEntry } = lorebookEntries.useActions();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const shown = (list.data ?? []).filter((book) => !hidden.has(book.id));

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const book = lorebookFromJson(JSON.parse(await file.text()) as unknown, file.name.replace(/\.json$/i, ''));
        return writeImportedBook(book, { createBook: create, createEntry });
      }),
    );
    const done = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failed = results.flatMap((result, index) => (result.status === 'rejected' ? [`${files[index]?.name ?? 'A file'}: could not be imported`] : []));
    if (done.length > 0) notify(done.length === 1 ? `Lorebook imported (${done[0]?.entries ?? 0} entries)` : `${done.length} lorebooks imported`);
    if (failed.length > 0) notify('Some files were not imported', failed.join('\n'));
  };

  const createBlank = async () => {
    const created = await create({ name: 'New lorebook' });
    router.push(`/lorebooks/${created.id}`);
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' className='h-11' onClick={() => void createBlank()}>
          <BookPlus aria-hidden /> New lorebook
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Import World Info
        </Button>
        <input ref={fileInput} type='file' accept='.json,application/json' multiple hidden onChange={(event) => void importFiles(event)} />
      </div>
      {list.error !== undefined && <LoadProblem what='your lorebooks' error={list.error} onRetry={() => list.mutate()} />}
      {list.data === undefined && list.error === undefined && <SkeletonRows rows={3} />}
      {list.data !== undefined && shown.length === 0 && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>
          No lorebooks yet. Start one, or import a SillyTavern World Info file.
        </p>
      )}
      <ul className='divide-y rounded-xl border'>
        {shown.map((book) => (
          <li key={book.id} className='relative flex items-center gap-3 p-3'>
            <Link href={`/lorebooks/${book.id}`} className='min-w-0 flex-1 after:absolute after:inset-0'>
              <span className='block truncate font-medium'>{book.name}</span>
              <span className='block truncate text-xs text-muted-foreground'>{book.description || 'No description'}</span>
            </Link>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='relative z-10 size-11'
              aria-label={`Delete ${book.name}`}
              onClick={() => {
                setHidden(new Set([...hidden, book.id]));
                deferWithUndo(`${book.name} deleted`, () => void remove(book), () => setHidden(new Set([...hidden].filter((id) => id !== book.id))));
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
