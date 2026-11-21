// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { latestCampaigns } from './latestCampaigns';

describe('latestCampaigns', () => {
  it('the three most recently played campaigns, newest first; sandbox chats left out', () => {
    const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
    expect(
      latestCampaigns([
        { id: 'a', title: 'A', campaign_id: 'c', created_at: at(1), updated_at: at(5) },
        { id: 'b', title: 'B', campaign_id: null, created_at: at(9) },
        { id: 'c', title: 'C', campaign_id: 'c', created_at: at(2) },
        { id: 'd', title: 'D', campaign_id: 'c', created_at: at(3), updated_at: at(8) },
        { id: 'e', title: 'E', campaign_id: 'c', created_at: at(4) },
      ]).map((one) => one.title),
    ).toEqual(['D', 'A', 'E']);
  });
});
