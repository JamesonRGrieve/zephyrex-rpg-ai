// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A canon notice (docs/DESIGN.md, Canon warnings): yellow when a line likely contravenes
 * established canon, red when it flagrantly breaks in-universe canon, with the reason and the fact
 * it conflicts with. Table information only: it never enters the story.
 */
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { createContext, type ReactElement, useContext, useState } from 'react';
import { type AppDrawerApi, useAppDrawer } from 'zephyrex/components/appwrapper/src/AppDrawer';
import { Button } from 'zephyrex/ui/button';
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

/** The drawer, when the app wrapper provides one (outside it, as in a story, details show in place). */
export function useDrawer(): AppDrawerApi | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- called on every render; only the throw is caught.
    return useAppDrawer();
  } catch {
    return null;
  }
}

/** What the drawer holds: the whole finding, and turning warnings off for the campaign. */
export function CanonDetails({
  notice,
  onTurnOff,
}: {
  notice: CanonNoticeValue;
  onTurnOff: (() => void) | null;
}): ReactElement {
  const red = notice.level === 'red';
  return (
    <div className='grid gap-4 text-sm'>
      <p>
        <span className='font-medium'>{red ? 'Breaks canon. ' : 'May contravene canon. '}</span>
        {notice.reason}
      </p>
      <p className='text-muted-foreground'>
        Canon warnings compare lines with the setting and this campaign&apos;s record. They are table information only and
        never enter the story.
      </p>
      {onTurnOff !== null && (
        <Button type='button' variant='outline' onClick={onTurnOff}>
          Turn off canon warnings for this campaign
        </Button>
      )}
    </div>
  );
}

/**
 * The notice itself is one short line with a Details button (the operator, 2026-11-22: "The canon
 * warnings should have a details button that will pull the drawer up from the bottom with details, and
 * the disable canon warnings button should be in the drawer").
 */
export function CanonNotice({ notice, className }: { notice: CanonNoticeValue; className?: string }): ReactElement | null {
  const turnOff = useContext(CanonOff);
  const drawer = useDrawer();
  const [inPlace, setInPlace] = useState(false);
  if (notice.level === 'none') return null;
  const red = notice.level === 'red';
  const Icon = red ? OctagonAlert : TriangleAlert;
  const off =
    turnOff === null
      ? null
      : () => {
          turnOff();
          drawer?.close();
        };
  const details = <CanonDetails notice={notice} onTurnOff={off} />;
  return (
    <div
      role='status'
      className={cn(
        'grid gap-2 rounded-md border px-3 py-2 text-sm',
        red
          ? 'border-red-600 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950 dark:text-red-100'
          : 'border-yellow-500 bg-yellow-50 text-yellow-900 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100',
        className,
      )}
    >
      <p className='flex items-center gap-2'>
        <Icon className='size-4 shrink-0' aria-hidden />
        <span className='min-w-0 flex-1 truncate'>
          <span className='font-medium'>{red ? 'Breaks canon: ' : 'Canon check: '}</span>
          {notice.reason}
        </span>
        <button
          type='button'
          className='shrink-0 underline underline-offset-2'
          onClick={() =>
            drawer === null
              ? setInPlace((now) => !now)
              : drawer.open(
                  details,
                  red ? 'Breaks canon' : 'Canon check',
                  'Where this differs from the setting or the campaign.',
                )
          }
        >
          Details
        </button>
      </p>
      {drawer === null && inPlace && details}
    </div>
  );
}
