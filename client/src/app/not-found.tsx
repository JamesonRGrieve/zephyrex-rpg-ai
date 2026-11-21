// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from 'zephyrex/ui/button';
import { AppPage } from '~/components/common/AppPage';

/** An address that isn't a page: in the app's frame and theme, with the way back (not Next's bare 404). */
export default function NotFound(): ReactNode {
  return (
    <AppPage title='Not found' heading='This page isn’t here' width='medium'>
      <div className='grid justify-items-start gap-4'>
        <p className='text-muted-foreground'>The address may be mistyped, or what it pointed to was deleted.</p>
        <Button asChild className='h-11'>
          <Link href='/play'>Back to your chats</Link>
        </Button>
      </div>
    </AppPage>
  );
}
