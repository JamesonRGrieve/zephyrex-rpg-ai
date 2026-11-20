// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatLibrary } from '~/components/play/ChatLibrary';

export default function PlayPage(): ReactNode {
  return (
    <AppPage title='Play' width='medium'>
      <h1 className='sr-only'>Your chats</h1>
      {/* The library reads the URL's ?new=1 (the install shortcut). */}
      <Suspense>
        <ChatLibrary />
      </Suspense>
    </AppPage>
  );
}
