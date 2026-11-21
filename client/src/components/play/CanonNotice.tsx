// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A canon notice (docs/DESIGN.md, Canon warnings): yellow when a line likely contravenes
 * established canon, red when it flagrantly breaks in-universe canon, with the reason and the fact
 * it conflicts with. Table information only: it never enters the story.
 */
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { createContext, type ReactElement, useContext } from 'react';
import { cn } from '~/lib/utils';

export interface CanonNoticeValue {
  level: 'none' | 'yellow' | 'red';
  reason: string;
}

/**
 * Turning canon warnings off for the campaign (the operator, 2026-11-21: "a 'permanently dismiss
 * for this campaign' button for radical looney toon campaigns"): the play screen provides it, and
 * every notice offers it. Undone in the chat's settings.
 */
export const CanonOff = createContext<(() => void) | null>(null);

export function CanonNotice({ notice, className }: { notice: CanonNoticeValue; className?: string }): ReactElement | null {
  if (notice.level === 'none') return null;
  const red = notice.level === 'red';
  const Icon = red ? OctagonAlert : TriangleAlert;
  const turnOff = useContext(CanonOff);
  return (
    <p
      role='status'
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        red
          ? 'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950 dark:text-red-100'
          : 'border-yellow-500 bg-yellow-50 text-yellow-900 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100',
        className,
      )}
    >
      <Icon className='mt-0.5 size-4 shrink-0' aria-hidden />
      <span>
        <span className='font-medium'>{red ? 'Breaks canon: ' : 'Canon check: '}</span>
        {notice.reason}
        {turnOff !== null && (
          <button type='button' className='ml-2 underline underline-offset-2' onClick={turnOff}>
            Turn off canon warnings for this campaign
          </button>
        )}
      </span>
    </p>
  );
}
