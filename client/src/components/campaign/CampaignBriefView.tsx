// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A scenario's page (docs/DESIGN.md, The play model: a scenario is a campaign framing such as
 * Solenne): start a campaign of it, carry on one of its campaigns, its prep, and its brief. Laid
 * out for a phone first: one column, the actions full width, nothing wider than the screen.
 */
import { ChevronRight, Play, ScrollText } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { LoadProblem } from 'zephyrex/ui/load-problem';
import { SkeletonRows } from 'zephyrex/ui/skeleton';
import { campaignPlays } from '~/features/data/playRecords';
import { campaigns, chats, scenarios } from '~/features/data/records';
import { lastActive } from '../play/ChatLibrary';
import { CampaignBrief, CampaignBriefTitle } from './CampaignBrief';

export function CampaignBriefView({ id }: { id: string }): ReactElement {
  const record = campaigns.useOne(id);
  const allChats = chats.useList();
  const plays = campaignPlays.useList();
  const prep = scenarios.useList();
  if (record.error !== undefined)
    return <LoadProblem what='this scenario' error={record.error} onRetry={() => record.mutate()} />;
  if (record.data === undefined) return <SkeletonRows rows={6} />;
  const playIds = new Set((plays.data ?? []).map((play) => play.chat_id));
  const ofThis = (allChats.data ?? [])
    .filter((chat) => chat.campaign_id === id && playIds.has(chat.id))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const prepOfThis = (prep.data ?? []).filter((one) => one.campaign_id === id);
  return (
    <div className='mx-auto grid w-full max-w-2xl min-w-0 gap-6'>
      <CampaignBriefTitle campaign={record.data} />
      <Button asChild className='h-12 w-full sm:w-auto sm:justify-self-start'>
        {/* The start sheet: pick the party and the seat to begin in. */}
        <Link href={`/play?new=1&campaign=${encodeURIComponent(id)}`}>
          <Play aria-hidden /> Start a campaign
        </Link>
      </Button>
      {ofThis.length > 0 && (
        <section aria-labelledby='scenario-campaigns' className='grid gap-2'>
          <h2 id='scenario-campaigns' className='text-lg font-semibold'>
            Your campaigns of it
          </h2>
          <ul className='grid gap-2'>
            {ofThis.map((chat) => (
              <li key={chat.id}>
                <Link
                  href={`/play/${chat.id}`}
                  className='flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 hover:bg-accent'
                >
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate font-medium'>{chat.title}</span>
                    <span className='block text-xs text-muted-foreground'>{lastActive(chat.updated_at)}</span>
                  </span>
                  <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {prepOfThis.length > 0 && (
        <section aria-labelledby='scenario-prep' className='grid gap-2'>
          <h2 id='scenario-prep' className='text-lg font-semibold'>
            Prep
          </h2>
          <ul className='grid gap-2'>
            {prepOfThis.map((one) => (
              <li key={one.id}>
                <Link
                  href={`/scenarios?edit=${one.id}`}
                  className='flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 hover:bg-accent'
                >
                  <ScrollText className='size-5 shrink-0 text-muted-foreground' aria-hidden />
                  <span className='min-w-0 flex-1 truncate font-medium'>{one.name}</span>
                  <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CampaignBrief campaign={record.data} titled={false} />
    </div>
  );
}
