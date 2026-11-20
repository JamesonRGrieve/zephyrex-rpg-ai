// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { LorebookEditor } from '~/components/lore/LorebookEditor';

export default async function LorebookPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AppPage title='Lorebook' width='medium'>
      <h1 className='sr-only'>Edit lorebook</h1>
      <LorebookEditor id={id} />
    </AppPage>
  );
}
