// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { PersonaManager } from '~/components/manage/PersonaManager';

export default function PersonasPage(): ReactNode {
  return (
    <AppPage title='Personas' width='medium'>
      <h1 className='sr-only'>Who you play as</h1>
      <PersonaManager />
    </AppPage>
  );
}
