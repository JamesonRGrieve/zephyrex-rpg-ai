// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, Suspense } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { CampaignManager } from '~/components/manage/CampaignManager';
import { ChatLibrary } from '~/components/play/ChatLibrary';

/**
 * Scenarios and their campaigns on one page (the operator, 2026-11-21: "merge the scenarios and
 * campaigns pages together and list the campaigns for each scenario under that scenario"). The chat
 * library stays for the new-campaign sheet (?new=1&campaign=) it opens.
 */
export default function PlayPage(): ReactNode {
  return (
    <AppPage title='Campaigns' heading='Your campaigns' width='medium'>
      <Suspense>
        <CampaignManager />
        <ChatLibrary kind='campaigns' startOnly />
      </Suspense>
    </AppPage>
  );
}
