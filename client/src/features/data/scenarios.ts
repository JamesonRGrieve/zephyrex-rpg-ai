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
});
export type Scenario = z.infer<typeof scenarioSchema>;

const namedSchema = z.object({ id: z.string(), name: z.string() });
export type Named = z.infer<typeof namedSchema>;

export const NO_SETTING = 'No setting';
export const NO_SYSTEM = 'No system';

export interface SystemGroup {
  system: string;
  scenarios: Scenario[];
}
export interface SettingGroup {
  setting: string;
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
      systems: [...inSetting.keys()].sort(last(NO_SYSTEM)).map((system) => ({
        system,
        scenarios: [...(inSetting.get(system) ?? [])].sort((a, b) => byName(a.name, b.name)),
      })),
    };
  });
}

/** The grouped scenarios; the system names are absent (all "No system") when the VTT is not loaded. */
export function useScenarioGroups() {
  const client = useClient();
  return useSWR(['rpg-ai', 'scenario-groups'], async () => {
    const [scenarios, settings, systems] = await Promise.all([
      client.list('/v1/campaign', 'campaigns', scenarioSchema, {}),
      client.list('/v1/setting', 'settings', namedSchema, {}).catch(() => []),
      client.list('/v1/game_system', 'game_systems', namedSchema, {}).catch(() => []),
    ]);
    return groupScenarios(scenarios, settings, systems);
  });
}
