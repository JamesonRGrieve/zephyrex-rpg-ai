// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * "Previously…" (AP2): the chat's rolling summary at the top when a session starts, so the table
 * picks the story up where it was left. Hidden for this visit on request; read aloud where the
 * browser can speak (A29).
 */
import { Volume2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';

export function Recap({
  summary,
  onRead,
  onHide,
}: {
  summary: string;
  /** Reads the recap aloud; absent where the browser cannot speak. */
  onRead?: () => void;
  onHide: () => void;
}): ReactElement | null {
  if (summary.trim() === '') return null;
  return (
    <section aria-label='Previously' className='rounded-xl border bg-muted/40 p-4'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold'>Previously…</h2>
        <div className='flex gap-1'>
          {onRead !== undefined && (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-11'
              aria-label='Read the recap aloud'
              onClick={onRead}
            >
              <Volume2 aria-hidden />
            </Button>
          )}
          <Button type='button' variant='ghost' size='icon' className='size-11' aria-label='Hide the recap' onClick={onHide}>
            <X aria-hidden />
          </Button>
        </div>
      </div>
      <p className='mt-1 text-sm whitespace-pre-wrap text-muted-foreground'>{summary.trim()}</p>
    </section>
  );
}
