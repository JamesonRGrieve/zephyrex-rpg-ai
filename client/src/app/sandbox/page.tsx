// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatLibrary } from '~/components/play/ChatLibrary';

/** One-on-one and group roleplay (SillyTavern's chats), apart from campaigns (the operator, 2026-11-21). */
export default function SandboxPage(): ReactNode {
  return (
    <AppPage title='Roleplay Sandbox' heading='Roleplay Sandbox' width='medium'>
      {/* The library reads the URL's ?new=1 (the install shortcut). */}
      <Suspense>
        <ChatLibrary kind='sandbox' />
      </Suspense>
    </AppPage>
  );
}
