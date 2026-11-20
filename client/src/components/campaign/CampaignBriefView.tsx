// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** A campaign's brief, read from the back end, with the four states of every data view. */
import type { ReactElement } from 'react';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { campaigns } from '~/features/data/records';
import { CampaignBrief } from './CampaignBrief';

export function CampaignBriefView({ id }: { id: string }): ReactElement {
  const record = campaigns.useOne(id);
  if (record.error !== undefined) return <LoadProblem what='this campaign' error={record.error} onRetry={() => record.mutate()} />;
  if (record.data === undefined) return <SkeletonRows rows={6} />;
  return <CampaignBrief campaign={record.data} />;
}
