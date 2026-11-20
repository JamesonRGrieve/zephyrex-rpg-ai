// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every character: search, a tag filter (A51), favourites first, a new blank card, and SillyTavern card import (PNG or
 * JSON, several at once; a card's embedded lorebook becomes the character's own). On a phone the grid is two columns and the actions sit in reach.
 */
import { Download, FileUp, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type ReactElement, useId, useMemo, useRef, useState } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { notify } from 'zephyrex/hooks/useToast';
import { useClient } from 'zephyrex';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { type Character, characters, lorebookEntries, lorebooks } from '~/features/data/records';
import { CardError, readCardFile } from '~/features/import/stCard';
import { cardWithBook } from '~/features/import/characterCard';
import { exportCard } from '~/features/import/exportCard';
import { draftOf, entriesOfBook } from './CharacterEditor';
import { writeImportedBook } from '../lore/importBook';
import { CharacterTile } from './CharacterTile';

/** Every tag the characters use, most used first, then by name (A51). */
export function tagsOf(characters: readonly Pick<Character, 'tags'>[]): string[] {
  const counts = new Map<string, number>();
  for (const character of characters) for (const tag of character.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)).map(([tag]) => tag);
}

/** Whether `character` matches the search (name, tags, description), ignoring case. */
export function matchesSearch(character: Pick<Character, 'name' | 'tags' | 'description'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [character.name, character.description, ...character.tags].some((text) => text.toLowerCase().includes(needle));
}

export function CharacterGallery(): ReactElement {
  const list = characters.useList();
  const { create, update } = characters.useActions();
  const { create: createBook } = lorebooks.useActions();
  const books = lorebooks.useList();
  const { create: createEntry } = lorebookEntries.useActions();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => tagsOf(list.data ?? []), [list.data]);
  const shown = useMemo(
    () =>
      (list.data ?? []).filter(
        (character) => matchesSearch(character, query) && (tag === null || character.tags.includes(tag)),
      ),
    [list.data, query, tag],
  );

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const { fields, avatar, book } = await readCardFile(file);
        // A card's own lorebook comes with it, as the character's lorebook.
        const own = book === null ? null : await writeImportedBook(book, { createBook, createEntry });
        return create({ ...fields, avatar, lorebook_id: own?.id ?? null });
      }),
    );
    const imported = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            `${files[index]?.name ?? 'A file'}: ${result.reason instanceof CardError ? result.reason.message : 'could not be imported'}`,
          ]
        : [],
    );
    if (imported > 0) notify(imported === 1 ? 'Character imported' : `${imported} characters imported`);
    if (failed.length > 0) notify('Some cards were not imported', failed.join('\n'));
  };

  /** Batch export (A2): every character shown (the search and tag pick which), each as its own card file. */
  const client = useClient();
  const [exporting, setExporting] = useState(false);
  const exportShown = async () => {
    setExporting(true);
    try {
      for (const character of shown) {
        const book = (books.data ?? []).find((one) => one.id === character.lorebook_id);
        const card = await cardWithBook({ ...draftOf(character), extensions: character.extensions }, book, () =>
          entriesOfBook(client, book?.id ?? ''),
        );
        await exportCard(character.name, character.avatar, card);
      }
      notify(shown.length === 1 ? 'Card exported' : `${shown.length} cards exported`);
    } catch {
      notify('Not every card was exported', 'Try again, or export the rest one at a time.');
    } finally {
      setExporting(false);
    }
  };

  const createBlank = async () => {
    const created = await create({ name: 'New character' });
    router.push(`/characters/${created.id}`);
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <label htmlFor={searchId} className='sr-only'>
          Search characters
        </label>
        <div className='relative min-w-0 flex-1 basis-48'>
          <Search
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            id={searchId}
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search by name or tag'
            className='h-11 pl-9'
          />
        </div>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Import cards
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          disabled={exporting || shown.length === 0}
          onClick={() => void exportShown()}
        >
          <Download aria-hidden />{' '}
          {shown.length === (list.data ?? []).length ? 'Export all' : `Export ${shown.length} shown`}
        </Button>
        <Button type='button' className='h-11' onClick={() => void createBlank()}>
          <Plus aria-hidden /> New character
        </Button>
        <input
          ref={fileInput}
          type='file'
          accept='.png,.json,image/png,application/json'
          multiple
          hidden
          onChange={(event) => void importFiles(event)}
        />
      </div>
      {tags.length > 0 && (
        <div ref={chipGroup} role='radiogroup' aria-label='Tag' className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1'>
          {[null, ...tags].map((one) => (
            <ChoiceChip
              key={one ?? ''}
              checked={tag === one}
              className='h-9 shrink-0 rounded-full border px-3 text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground'
              onClick={() => setTag(one)}
            >
              {one ?? 'All'}
            </ChoiceChip>
          ))}
        </div>
      )}
      {list.error !== undefined && <LoadProblem what='your characters' error={list.error} onRetry={() => list.mutate()} />}
      {list.data === undefined && list.error === undefined && <SkeletonRows rows={4} />}
      {list.data !== undefined && list.data.length === 0 && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>
          No characters yet. Import a SillyTavern card, or start a new one.
        </p>
      )}
      {list.data !== undefined && list.data.length > 0 && shown.length === 0 && (
        <p className='text-muted-foreground'>No character matches{query.trim() === '' ? ' that tag' : ` “${query}”`}.</p>
      )}
      <ul className='grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3'>
        {shown.map((character) => (
          <li key={character.id}>
            <CharacterTile
              character={character}
              onToggleFavourite={() => void update(character, { favourite: !character.favourite })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
