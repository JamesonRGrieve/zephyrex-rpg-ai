// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatView } from '~/components/play/ChatView';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AppPage title='Chat' width='medium'>
      <h1 className='sr-only'>Chat</h1>
      <ChatView id={id} />
    </AppPage>
  );
}
