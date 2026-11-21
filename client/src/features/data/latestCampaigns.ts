// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The three most recent campaigns under Campaigns in the sidebar (the operator, 2026-11-21: "the 3
 * most recent campaign sessions as submenu under campaigns"), live as chats change.
 */
import { chats } from '~/features/data/records';

const LATEST = 3;

export function latestCampaigns(
  list: readonly {
    id: string;
    title: string;
    campaign_id?: string | null;
    updated_at?: string | null;
    created_at: string;
  }[],
): { title: string; url: string }[] {
  return list
    .filter((chat) => chat.campaign_id !== null && chat.campaign_id !== undefined)
    .toSorted((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at))
    .slice(0, LATEST)
    .map((chat) => ({ title: chat.title, url: `/play/${chat.id}` }));
}

export function useLatestCampaigns(): { title: string; url: string }[] | undefined {
  const list = chats.useList();
  return list.data === undefined ? undefined : latestCampaigns(list.data);
}
