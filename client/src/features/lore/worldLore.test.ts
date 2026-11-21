// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/world-lore-cases.json';
import { type WorldEntity, wikiCampaignOf, worldLoreEntries, worldLoreEntry } from './worldLore';

describe('the world lore cases both twins run', () => {
  it.each(cases.entry_cases)('$name', ({ entity, entry }) => {
    expect(worldLoreEntry(entity as WorldEntity)).toEqual(entry);
  });
  it.each(cases.campaign_cases)('$name', ({ campaign_id: campaignId, frames, wiki_campaign: wikiCampaign }) => {
    expect(wikiCampaignOf(campaignId, new Map(Object.entries(frames)))).toBe(wikiCampaign);
  });
  it('keeps the wiki’s order, dropping what’s left out', () => {
    const entities = cases.entry_cases.map((one) => one.entity as WorldEntity);
    expect(worldLoreEntries(entities).map((entry) => entry.id)).toEqual(['p1', 'l1', 'x', 'd']);
  });
});
