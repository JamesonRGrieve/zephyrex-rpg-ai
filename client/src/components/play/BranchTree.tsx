// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Every branch of a chat at once (A8): the whole tree, a straight run of turns in one column and a
 * step in at each fork, the branch shown marked. Choosing a message shows the branch through it,
 * ending at its newest reply.
 */
import { CornerDownRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '~/lib/utils';

export interface BranchRow {
  id: string;
  speaker: string;
  text: string;
  depth: number;
  onPath: boolean;
  leaf: boolean;
}

export function BranchTree({ rows, onPick }: { rows: readonly BranchRow[]; onPick: (id: string) => void }): ReactElement {
  if (rows.length === 0) return <p className='text-sm text-muted-foreground'>Nothing written yet.</p>;
  return (
    <ol className='grid gap-1' aria-label='Every branch'>
      {rows.map((row) => (
        <li key={row.id} style={{ paddingInlineStart: `${Math.min(row.depth, 8) * 1}rem` }}>
          <button
            type='button'
            aria-current={row.onPath ? 'true' : undefined}
            className={cn(
              'flex min-h-11 w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent',
              row.onPath ? 'border-primary' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => onPick(row.id)}
          >
            {row.depth > 0 && <CornerDownRight className='mt-0.5 size-4 shrink-0' aria-hidden />}
            <span className='min-w-0 flex-1'>
              <span className='font-medium text-foreground'>{row.speaker}: </span>
              <span className='line-clamp-2 [overflow-wrap:anywhere]'>{row.text}</span>
            </span>
            {row.leaf && <span className='shrink-0 text-xs'>end</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}
