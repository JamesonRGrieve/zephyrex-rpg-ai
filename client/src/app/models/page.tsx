// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { EndpointManager } from '~/components/manage/EndpointManager';

export default function ModelsPage(): ReactNode {
  return (
    <AppPage title='Models' width='medium'>
      <h1 className='sr-only'>Your models</h1>
      <EndpointManager />
    </AppPage>
  );
}
