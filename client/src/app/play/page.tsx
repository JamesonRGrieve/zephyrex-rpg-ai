// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatLibrary } from '~/components/play/ChatLibrary';

export default function PlayPage(): ReactNode {
  return (
    <AppPage title='Play' heading='Your chats' width='medium'>
      {/* The library reads the URL's ?new=1 (the install shortcut). */}
      <Suspense>
        <ChatLibrary />
      </Suspense>
    </AppPage>
  );
}
