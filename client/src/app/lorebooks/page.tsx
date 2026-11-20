// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { LorebookLibrary } from '~/components/lore/LorebookLibrary';

export default function LorebooksPage(): ReactNode {
  return (
    <AppPage title='Lorebooks' width='medium'>
      <h1 className='sr-only'>Lorebooks</h1>
      <LorebookLibrary />
    </AppPage>
  );
}
