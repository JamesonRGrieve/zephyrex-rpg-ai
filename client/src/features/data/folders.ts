// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Where a character sits in the sandbox picker (the operator, 2026-11-21): "setting/name (global
 * canonical), setting/scenario/name (scenario defaults) and setting/scenario/campaign/name
 * (campaign specific with knowledge of play)". A setting-wide person is canon; a person in a
 * scenario is its default; a person in a playthrough is that campaign's, with what happened in play.
 */
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';

const personRow = z.object({
  id: z.string(),
  campaign_id: z.string().nullish(),
  setting_id: z.string().nullish(),
});
const campaignRow = z.object({
  id: z.string(),
  name: z.string(),
  setting_id: z.string().nullish(),
  scenario_id: z.string().nullish(),
});
const settingRow = z.object({ id: z.string(), name: z.string() });

export type PersonRow = z.infer<typeof personRow>;
export type CampaignRow = z.infer<typeof campaignRow>;
export type SettingRow = z.infer<typeof settingRow>;

export const NO_SETTING_FOLDER = 'No setting';

/** A person's folder: setting, setting / scenario, or setting / scenario / campaign. */
export function folderOf(person: PersonRow, campaigns: readonly CampaignRow[], settings: readonly SettingRow[]): string {
  const byId = new Map(campaigns.map((one) => [one.id, one]));
  const settingName = (id: string | null | undefined) =>
    settings.find((one) => one.id === id)?.name ?? NO_SETTING_FOLDER;
  const campaign = person.campaign_id ? byId.get(person.campaign_id) : undefined;
  if (campaign === undefined) return settingName(person.setting_id);
  const scenario = campaign.scenario_id ? byId.get(campaign.scenario_id) : undefined;
  if (scenario === undefined) return `${settingName(campaign.setting_id)} / ${campaign.name}`;
  return `${settingName(scenario.setting_id ?? campaign.setting_id)} / ${scenario.name} / ${campaign.name}`;
}

/** Each person's folder, keyed by id (empty while loading). */
export function usePersonFolders(): ReadonlyMap<string, string> {
  const client = useClient();
  const { data } = useSWR(['rpg-ai', 'person-folders'], async () => {
    const [persons, campaigns, settings] = await Promise.all([
      client.list('/v1/person', 'persons', personRow, {}),
      client.list('/v1/campaign', 'campaigns', campaignRow, {}),
      client.list('/v1/setting', 'settings', settingRow, {}).catch(() => []),
    ]);
    return new Map(persons.map((person) => [person.id, folderOf(person, campaigns, settings)]));
  });
  return data ?? EMPTY;
}

const EMPTY: ReadonlyMap<string, string> = new Map();
