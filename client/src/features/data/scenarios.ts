// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The scenarios to start from (docs/DESIGN.md, The composed suite): the wiki's campaigns, grouped
 * by setting and then by game system (the operator, 2026-11-21: "grouped by setting, and then by
 * system"). The setting is the wiki's (rpg_core settings), the system the VTT's (game_systems).
 */
import useSWR from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';

const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  setting_id: z.string().nullish(),
  game_system_id: z.string().nullish(),
  is_scenario: z.boolean().nullish(),
  /** Where it comes from (the wiki's provenance): homebrew, official or adapted, and the source. */
  provenance: z.string().nullish(),
  source: z.string().nullish(),
  scenario_id: z.string().nullish(),
});
export type Scenario = z.infer<typeof scenarioSchema> & { tags?: string[] };

const namedSchema = z.object({ id: z.string(), name: z.string() });
const taggedSchema = z.object({ taxon_id: z.string(), target_entity_id: z.string() });

/** Each scenario's play-style tags (the wiki's world_taxonomy, kind play_style), by name A–Z. */
export function withTags(
  scenarios: readonly Scenario[],
  styles: readonly Named[],
  tagged: readonly { taxon_id: string; target_entity_id: string }[],
): Scenario[] {
  const name = new Map(styles.map((one) => [one.id, one.name]));
  const byCampaign = new Map<string, string[]>();
  for (const row of tagged) {
    const style = name.get(row.taxon_id);
    if (style === undefined) continue;
    byCampaign.set(row.target_entity_id, [...(byCampaign.get(row.target_entity_id) ?? []), style]);
  }
  return scenarios.map((one) => ({ ...one, tags: [...new Set(byCampaign.get(one.id) ?? [])].sort(byName) }));
}

/** The scenarios carrying every one of `wanted` (none wanted: all). */
export function taggedWith(scenarios: readonly Scenario[], wanted: readonly string[]): Scenario[] {
  return scenarios.filter((one) => wanted.every((tag) => (one.tags ?? []).includes(tag)));
}
export type Named = z.infer<typeof namedSchema>;

export const NO_SETTING = 'No setting';
export const NO_SYSTEM = 'No system';

export interface SystemGroup {
  system: string;
  scenarios: Scenario[];
}
export interface SettingGroup {
  setting: string;
  /** The setting's id, for its page in the wiki; null for scenarios in no setting. */
  settingId: string | null;
  systems: SystemGroup[];
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Settings A–Z (the ungrouped last), each with its systems A–Z (the ungrouped last), each A–Z. */
export function groupScenarios(
  scenarios: readonly Scenario[],
  settings: readonly Named[],
  systems: readonly Named[],
): SettingGroup[] {
  const settingName = new Map(settings.map((one) => [one.id, one.name]));
  const systemName = new Map(systems.map((one) => [one.id, one.name]));
  const tree = new Map<string, Map<string, Scenario[]>>();
  for (const scenario of scenarios) {
    const setting = settingName.get(scenario.setting_id ?? '') ?? NO_SETTING;
    const system = systemName.get(scenario.game_system_id ?? '') ?? NO_SYSTEM;
    const inSetting = tree.get(setting) ?? new Map<string, Scenario[]>();
    tree.set(setting, inSetting);
    inSetting.set(system, [...(inSetting.get(system) ?? []), scenario]);
  }
  const last = (fallback: string) => (a: string, b: string) =>
    a === fallback ? 1 : b === fallback ? -1 : byName(a, b);
  return [...tree.keys()].sort(last(NO_SETTING)).map((setting) => {
    const inSetting = tree.get(setting) ?? new Map<string, Scenario[]>();
    return {
      setting,
      settingId: settings.find((one) => one.name === setting)?.id ?? null,
      systems: [...inSetting.keys()].sort(last(NO_SYSTEM)).map((system) => ({
        system,
        scenarios: [...(inSetting.get(system) ?? [])].sort((a, b) => byName(a.name, b.name)),
      })),
    };
  });
}

/**
 * The scenarios with their play-style tags, and the settings and systems to group them by; the
 * system names are absent (all "No system") when the VTT is not loaded, and the tags when the wiki
 * has no play styles.
 */
export function useScenarios() {
  const client = useClient();
  return useSWR(['rpg-ai', 'scenarios'], async () => {
    const [campaigns, settings, systems, styles, tagged] = await Promise.all([
      client.list('/v1/campaign', 'campaigns', scenarioSchema, {}),
      client.list('/v1/setting', 'settings', namedSchema, {}).catch(() => []),
      client.list('/v1/game_system', 'game_systems', namedSchema, {}).catch(() => []),
      client.list('/v1/taxon', 'taxons', namedSchema, { kind: 'play_style' }).catch(() => []),
      client
        .list('/v1/entity_taxon', 'entity_taxons', taggedSchema, { target_entity_type: 'campaign' })
        .catch(() => []),
    ]);
    const scenarios = campaigns.filter((one) => one.is_scenario === true);
    // Each playthrough's scenario: the campaign it was copied from (copy on start).
    const scenarioOf = new Map(campaigns.map((one) => [one.id, one.scenario_id ?? one.id]));
    return {
      scenarioOf,
      scenarios: withTags(scenarios, styles, tagged),
      settings,
      systems,
      styles: [...new Set(styles.map((one) => one.name))].sort(byName),
    };
  });
}
