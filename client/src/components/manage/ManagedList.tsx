// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A list of one kind of record with an editor in a sheet: the shape the personas, presets and
 * models pages share. The sheet opens from the bottom on a phone and from the side on a wide screen;
 * deleting offers an undo.
 */
import { idOf } from '~/features/data/records';
import { useHidden } from 'zephyrex/hooks/useWrites';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, type ReactNode, useState } from 'react';
import { deferWithUndo } from 'zephyrex/hooks/useToast';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { Badge } from 'zephyrex/ui/badge';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { SkeletonRows } from 'zephyrex/ui/skeleton';

export interface ManagedRow {
  id: string;
  name: string;
}

export function ManagedList<T extends ManagedRow>({
  what,
  rows,
  error,
  onRetry,
  summary,
  isDefault,
  newLabel,
  emptyText,
  editor,
  onDelete,
  href,
  openId,
}: {
  /** The kind of record, as a sentence names it ("persona"). */
  what: string;
  rows: readonly T[] | undefined;
  error?: Error;
  onRetry?: () => Promise<unknown>;
  summary: (row: T) => ReactNode;
  isDefault?: (row: T) => boolean;
  newLabel: string;
  emptyText: string;
  /** The editor for a row, or for a new one (null); `done` closes the sheet. */
  editor: (row: T | null, done: () => void) => ReactNode;
  onDelete: (row: T) => void;
  /** A page for each row: a tap opens it, and an Edit button opens the editor instead. */
  href?: (row: T) => string;
  /** A row whose editor opens once the rows load (a link such as `?edit=<id>`). */
  openId?: string | null;
}): ReactElement {
  const mobile = useIsMobile();
  const [chosen, setEditing] = useState<T | 'new' | null>(null);
  const [linked, setLinked] = useState(openId ?? null);
  const editing = chosen ?? (linked === null ? null : (rows?.find((row) => row.id === linked) ?? null));
  const hidden = useHidden(rows ?? [], idOf);
  const shown = hidden.shown;
  const close = () => {
    setEditing(null);
    setLinked(null);
  };

  return (
    <div className='space-y-4'>
      <Button type='button' className='h-11' onClick={() => setEditing('new')}>
        <Plus aria-hidden /> {newLabel}
      </Button>
      {error !== undefined && <LoadProblem what={`your ${what}s`} error={error} onRetry={onRetry} />}
      {rows === undefined && error === undefined && <SkeletonRows rows={3} />}
      {rows !== undefined && shown.length === 0 && !hidden.pending && (
        <p className='rounded-xl border border-dashed p-8 text-center text-muted-foreground'>{emptyText}</p>
      )}
      <ul className='divide-y rounded-xl border empty:hidden'>
        {shown.map((row) => (
          <li key={row.id} className='flex items-center gap-3 p-2'>
            {href === undefined ? (
              <button
                type='button'
                className='flex min-h-12 min-w-0 flex-1 flex-col items-start rounded-md px-2 text-left hover:bg-accent'
                onClick={() => setEditing(row)}
              >
                <span className='flex items-center gap-2 font-medium'>
                  {row.name}
                  {isDefault?.(row) === true && <Badge variant='secondary'>Default</Badge>}
                </span>
                <span className='w-full truncate text-xs text-muted-foreground'>{summary(row)}</span>
              </button>
            ) : (
              <>
                <Link
                  href={href(row)}
                  className='flex min-h-12 min-w-0 flex-1 flex-col items-start justify-center rounded-md px-2 text-left hover:bg-accent'
                >
                  <span className='flex items-center gap-2 font-medium'>
                    {row.name}
                    {isDefault?.(row) === true && <Badge variant='secondary'>Default</Badge>}
                  </span>
                  <span className='w-full truncate text-xs text-muted-foreground'>{summary(row)}</span>
                </Link>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-11'
                  aria-label={`Edit ${row.name}`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil aria-hidden />
                </Button>
              </>
            )}
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-11'
              aria-label={`Delete ${row.name}`}
              onClick={() => {
                hidden.hide([row.id]);
                deferWithUndo(
                  `${row.name} deleted`,
                  () => onDelete(row),
                  () => hidden.show([row.id]),
                );
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Sheet open={editing !== null} onOpenChange={(open) => !open && close()}>
        <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[90svh] overflow-y-auto pb-safe'>
          <SheetHeader>
            <SheetTitle>{editing === 'new' ? newLabel : `Edit ${what}`}</SheetTitle>
            <SheetDescription className='sr-only'>{`The ${what}'s settings`}</SheetDescription>
          </SheetHeader>
          <div className='p-4'>{editing !== null && editor(editing === 'new' ? null : editing, close)}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
