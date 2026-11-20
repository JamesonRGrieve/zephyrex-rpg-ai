// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** Every campaign frame (A57): each edited in a sheet, each with its brief for the players (A58). */
import type { ReactElement } from 'react';
import { CampaignForm } from '~/components/campaign/CampaignForm';
import { campaigns } from '~/features/data/records';
import { ManagedList } from './ManagedList';

export function CampaignManager(): ReactElement {
  const list = campaigns.useList();
  const { remove } = campaigns.useActions();
  return (
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
  );
}
