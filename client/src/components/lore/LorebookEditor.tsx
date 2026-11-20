// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * One lorebook: its name and description, and its entries. Search them, switch one on or off in
 * place, open one to edit every field, add one, or export the book as a SillyTavern World Info
 * file. The entry editor opens from the side on a wide screen and from the bottom on a phone.
 */
import { useHidden } from 'zephyrex/hooks/useWrites';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useMemo, useState } from 'react';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { deferWithUndo, notify } from 'zephyrex/hooks/useToast';
import { writeProblem } from 'zephyrex';
import { Badge } from 'zephyrex/ui/badge';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { Switch } from 'zephyrex/ui/switch';
import { WriteProblem } from '~/components/common/WriteProblem';
import { LIMITS } from '~/contract';
import { type Lorebook, type LorebookEntry, lorebookEntries, lorebooks, idOf } from '~/features/data/records';
import { type EntryFields, lorebookToJson } from '~/features/import/stLorebook';
import { EntryForm } from './EntryForm';
import { BLANK_ENTRY } from './fixtures';

/** An entry's own fields, without the record's id, book and versions. */
const RECORD_KEYS = new Set(['id', 'created_at', 'updated_at', 'lorebook_id']);

export function entryFields(entry: LorebookEntry): EntryFields {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !RECORD_KEYS.has(key))) as EntryFields;
}

/** What a row is called: its label, else its first key, else the start of its content. */
export function entryTitle(entry: Pick<EntryFields, 'comment' | 'keys' | 'content'>): string {
  return entry.comment.trim() || entry.keys[0] || entry.content.trim().slice(0, 40) || 'Untitled entry';
}

/** Whether `entry` matches the search (label, keys, content), ignoring case. */
export function entryMatches(entry: Pick<EntryFields, 'comment' | 'keys' | 'content'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || [entry.comment, entry.content, ...entry.keys].some((text) => text.toLowerCase().includes(needle));
}

function download(name: string, json: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `${name.replace(/[^\w.-]+/g, '_') || 'lorebook'}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

function BookHeader({ book }: { book: Lorebook }): ReactElement {
  const { update } = lorebooks.useActions();
  const [name, setName] = useState(book.name);
  const [description, setDescription] = useState(book.description);
  const ids = { name: useId(), description: useId() };
  const changed = name !== book.name || description !== book.description;
  return (
    <form
      className='grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end'
      onSubmit={(event) => {
        event.preventDefault();
        void update(book, { name: name.trim() || book.name, description }).then(() => notify('Saved'));
      }}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={LIMITS.name_characters}
          className='h-11'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.description}>Description</Label>
        <Input
          id={ids.description}
          value={description}
          className='h-11'
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <Button type='submit' className='h-11' disabled={!changed}>
        Save
      </Button>
    </form>
  );
}

export function LorebookEditor({ id }: { id: string }): ReactElement {
  const book = lorebooks.useOne(id);
  const entries = lorebookEntries.useList({ lorebook_id: id });
  const { create, update, remove } = lorebookEntries.useActions();
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ entry: LorebookEntry | null; draft: EntryFields } | null>(null);
  const hidden = useHidden(entries.data ?? [], idOf);
  const searchId = useId();
  const [problem, setProblem] = useState<string | null>(null);

  const shown = useMemo(() => hidden.shown.filter((entry) => entryMatches(entry, query)), [hidden.shown, query]);

  if (book.error !== undefined) return <LoadProblem what='this lorebook' error={book.error} onRetry={() => book.mutate()} />;
  if (book.data === undefined) return <SkeletonRows rows={5} />;
  const current = book.data;

  const save = async () => {
    if (editing === null) return;
    const failed = await writeProblem(
      editing.entry === null ? create({ ...editing.draft, lorebook_id: current.id }) : update(editing.entry, editing.draft),
      'Not saved',
    );
    setProblem(failed);
    if (failed === null) {
      notify('Saved');
      setEditing(null);
    }
  };

  return (
    <div className='space-y-6'>
      <BookHeader key={current.id} book={current} />
      <div className='flex flex-wrap items-center gap-2'>
        <label htmlFor={searchId} className='sr-only'>
          Search entries
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
            placeholder='Search keys, labels and content'
            className='h-11 pl-9'
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button type='button' className='h-11' onClick={() => setEditing({ entry: null, draft: BLANK_ENTRY })}>
          <Plus aria-hidden /> New entry
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          onClick={() => download(current.name, lorebookToJson(current, (entries.data ?? []).map(entryFields)))}
        >
          <Download aria-hidden /> Export
        </Button>
      </div>
      {entries.error !== undefined && (
        <LoadProblem what='its entries' error={entries.error} onRetry={() => entries.mutate()} />
      )}
      {entries.data === undefined && entries.error === undefined && <SkeletonRows rows={4} />}
      {entries.data !== undefined && entries.data.length === 0 && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>
          No entries yet. Add one, with the words that should bring it into a reply.
        </p>
      )}
      <ul className='divide-y rounded-xl border' aria-label='Entries'>
        {shown.map((entry) => (
          <li key={entry.id} className='flex items-center gap-2 p-2'>
            <button
              type='button'
              className='flex min-h-12 min-w-0 flex-1 flex-col items-start rounded-md px-2 text-left hover:bg-accent'
              onClick={() => setEditing({ entry, draft: entryFields(entry) })}
            >
              <span className='flex flex-wrap items-center gap-2 font-medium'>
                {entryTitle(entry)}
                {entry.constant && <Badge variant='secondary'>Always on</Badge>}
              </span>
              <span className='w-full truncate text-xs text-muted-foreground'>
                {entry.constant ? 'In every reply' : entry.keys.join(', ') || 'No keys yet'}
              </span>
            </button>
            <Switch
              checked={entry.enabled}
              aria-label={`${entryTitle(entry)} enabled`}
              onCheckedChange={(enabled) => void update(entry, { enabled })}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-11'
              aria-label={`Delete ${entryTitle(entry)}`}
              onClick={() => {
                hidden.hide([entry.id]);
                deferWithUndo(
                  'Entry deleted',
                  () => void remove(entry),
                  () => hidden.show([entry.id]),
                );
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setProblem(null);
          }
        }}
      >
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className='max-h-[92svh] w-full overflow-y-auto pb-safe sm:max-w-xl'
        >
          <SheetHeader>
            <SheetTitle>{editing?.entry === null ? 'New entry' : 'Edit entry'}</SheetTitle>
            <SheetDescription className='sr-only'>Every field of the World Info entry</SheetDescription>
          </SheetHeader>
          {editing !== null && (
            <form
              className='grid gap-4 p-4'
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <EntryForm value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
              <WriteProblem problem={problem} />
              <Button type='submit' className='h-11'>
                Save entry
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
