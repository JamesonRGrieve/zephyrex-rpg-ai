// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** A campaign's brief, read from the back end, with the four states of every data view. */
import { MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { campaigns } from '~/features/data/records';
import { CampaignBrief } from './CampaignBrief';

export function CampaignBriefView({ id }: { id: string }): ReactElement {
  const record = campaigns.useOne(id);
  if (record.error !== undefined)
    return <LoadProblem what='this campaign' error={record.error} onRetry={() => record.mutate()} />;
  if (record.data === undefined) return <SkeletonRows rows={6} />;
  return (
    <div className='grid gap-6'>
      {/* The brief's own column (max-w-2xl, centred), so the action lines up with its title. */}
      <div className='mx-auto flex w-full max-w-2xl flex-wrap gap-2'>
        <Button asChild className='h-11'>
          {/* A new chat that plays in this frame: the picker opens with the campaign set. */}
          <Link href={`/play?new=1&campaign=${encodeURIComponent(id)}`}>
            <MessageSquarePlus aria-hidden /> Play in this campaign
          </Link>
        </Button>
      </div>
      <CampaignBrief campaign={record.data} />
    </div>
  );
}
