// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { CampaignBriefView } from '~/components/campaign/CampaignBriefView';

export default async function CampaignBriefPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AppPage title='Campaign brief' heading={null} width='medium'>
      <CampaignBriefView id={id} />
    </AppPage>
  );
}
