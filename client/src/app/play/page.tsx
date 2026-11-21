// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { CampaignManager } from '~/components/manage/CampaignManager';

/**
 * Scenarios and their campaigns on one page (the operator, 2026-11-21: "merge the scenarios and
 * campaigns pages together and list the campaigns for each scenario under that scenario"). A tap on a
 * scenario opens its start sheet in place.
 */
export default function PlayPage(): ReactNode {
  return (
    <AppPage title='Campaigns' heading='Your campaigns' width='medium'>
      <Suspense>
        <CampaignManager />
      </Suspense>
    </AppPage>
  );
}
