// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ScenarioManager } from '~/components/manage/ScenarioManager';

export default function ScenariosPage(): ReactNode {
  return (
    <AppPage title='Scenarios' heading='Scenarios' width='medium'>
      <ScenarioManager />
    </AppPage>
  );
}
