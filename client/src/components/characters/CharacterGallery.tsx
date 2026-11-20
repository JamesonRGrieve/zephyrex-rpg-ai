// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every character: search, favourites first, a new blank card, and SillyTavern card import (PNG or
 * JSON, several at once). On a phone the grid is two columns and the actions sit in reach.
 */
import { FileUp, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type ReactElement, useId, useMemo, useRef, useState } from 'react';
import { notify } from 'zephyrex/hooks/useToast';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { type Character, characters } from '~/features/data/records';
import { CardError, readCardFile } from '~/features/import/stCard';
import { CharacterTile } from './CharacterTile';

/** Whether `character` matches the search (name, tags, description), ignoring case. */
export function matchesSearch(character: Pick<Character, 'name' | 'tags' | 'description'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [character.name, character.description, ...character.tags].some((text) => text.toLowerCase().includes(needle));
}

export function CharacterGallery(): ReactElement {
  const list = characters.useList();
  const { create, update } = characters.useActions();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const shown = useMemo(() => (list.data ?? []).filter((character) => matchesSearch(character, query)), [list.data, query]);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const { fields, avatar } = await readCardFile(file);
        return create({ ...fields, avatar });
      }),
    );
    const imported = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected' ? [`${files[index]?.name ?? 'A file'}: ${result.reason instanceof CardError ? result.reason.message : 'could not be imported'}`] : [],
    );
    if (imported > 0) notify(imported === 1 ? 'Character imported' : `${imported} characters imported`);
    if (failed.length > 0) notify('Some cards were not imported', failed.join('\n'));
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
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden />
          <Input id={searchId} type='search' value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Search by name or tag' className='h-11 pl-9' />
        </div>
        <Button type='button' variant='outline' className='h-11' onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden /> Import cards
        </Button>
        <Button type='button' className='h-11' onClick={() => void createBlank()}>
          <Plus aria-hidden /> New character
        </Button>
        <input ref={fileInput} type='file' accept='.png,.json,image/png,application/json' multiple hidden onChange={(event) => void importFiles(event)} />
      </div>
      {list.error !== undefined && <LoadProblem what='your characters' error={list.error} onRetry={() => list.mutate()} />}
      {list.data === undefined && list.error === undefined && <SkeletonRows rows={4} />}
      {list.data !== undefined && list.data.length === 0 && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>
          No characters yet. Import a SillyTavern card, or start a new one.
        </p>
      )}
      {list.data !== undefined && list.data.length > 0 && shown.length === 0 && (
        <p className='text-muted-foreground'>No character matches “{query}”.</p>
      )}
      <ul className='grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3'>
        {shown.map((character) => (
          <li key={character.id}>
            <CharacterTile character={character} onToggleFavourite={() => void update(character, { favourite: !character.favourite })} />
          </li>
        ))}
      </ul>
    </div>
  );
}
