// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ChatView } from '~/components/play/ChatView';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AppPage title='Play' heading={null} width='medium' barTitle={false}>
      {/* A campaign's session or a sandbox chat (docs/DESIGN.md, The play model). */}
      <h1 className='sr-only'>Play</h1>
      <ChatView id={id} />
    </AppPage>
  );
}
