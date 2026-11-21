// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatLibrary } from '~/components/play/ChatLibrary';

/** Your campaigns (docs/DESIGN.md, The play model): save states of scenarios, newest first. */
export default function PlayPage(): ReactNode {
  return (
    <AppPage title='Campaigns' heading='Your campaigns' width='medium'>
      <Suspense>
        <ChatLibrary kind='campaigns' />
      </Suspense>
    </AppPage>
  );
}
