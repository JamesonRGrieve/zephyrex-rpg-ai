// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** Every campaign frame (A57): each edited in a sheet, each with its brief for the players (A58). */
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from 'zephyrex/ui/button';
import { CampaignForm } from '~/components/campaign/CampaignForm';
import { campaigns } from '~/features/data/records';
import { ManagedList } from './ManagedList';

export function CampaignManager(): ReactElement {
  const list = campaigns.useList();
  const { remove } = campaigns.useActions();
  return (
    <div className='grid gap-4'>
      <p className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        Starting with a table?
        <Button asChild variant='outline' className='h-11'>
          <Link href='/campaigns/session-zero'>Run session zero</Link>
        </Button>
      </p>
      <ManagedList
        what='campaign'
        rows={list.data}
        error={list.error}
        onRetry={() => list.mutate()}
        summary={(row) => [row.genre, row.premise].filter(Boolean).join(' · ') || 'No premise yet'}
        newLabel='New campaign'
        emptyText='No campaigns yet. Frame one: what kind of game it is, so every chat in it keeps to it.'
        editor={(row, done) => <CampaignForm campaign={row} done={done} />}
        onDelete={(row) => void remove(row)}
      />
    </div>
  );
}
