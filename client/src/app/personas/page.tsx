// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { PersonaManager } from '~/components/manage/PersonaManager';

export default function PersonasPage(): ReactNode {
  return (
    <AppPage title='Personas' heading='Who you play as' width='medium'>
      <PersonaManager />
    </AppPage>
  );
}
