// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ConnectionProfileManager } from '~/components/manage/ConnectionProfileManager';
import { EndpointManager } from '~/components/manage/EndpointManager';
import { InstructTemplateManager } from '~/components/manage/InstructTemplateManager';

export default function ModelsPage(): ReactNode {
  return (
    <AppPage title='Models' heading='Your models' width='medium'>
      <div className='grid gap-10'>
        <EndpointManager />
        <ConnectionProfileManager />
        <InstructTemplateManager />
      </div>
    </AppPage>
  );
}
