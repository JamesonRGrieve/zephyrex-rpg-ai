// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { CampaignManager } from '~/components/manage/CampaignManager';

export default function CampaignsPage(): ReactNode {
  return (
    <AppPage title='Scenarios' heading='Scenarios' width='medium'>
      <CampaignManager />
    </AppPage>
  );
}
