// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings that belong to this device, not to the person's records: how much the device should do
 * (the tier, docs/SUITE.md Mobile and PWA) and whether table talk shows in the story column. Kept in
 * the browser's storage, read through guards: a private window or blocked storage gives the defaults.
 */
import type { DeviceTier } from '~/features/device/tier';

export type TierChoice = 'auto' | DeviceTier;

export interface DeviceSettings {
  tier: TierChoice;
  showTableTalk: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { tier: 'auto', showTableTalk: true };

const KEY = 'rpg-ai:device-settings';
const TIERS: readonly TierChoice[] = ['auto', 'strong', 'standard', 'light'];

/** Settings read back from storage text, every unknown or missing field at its default. */
export function parseDeviceSettings(text: string | null): DeviceSettings {
  let stored: unknown = null;
  try {
    stored = text === null ? null : JSON.parse(text);
  } catch {
    stored = null;
  }
  const tier: unknown = Reflect.get(Object(stored), 'tier');
  const showTableTalk: unknown = Reflect.get(Object(stored), 'showTableTalk');
  return {
    tier: TIERS.includes(tier as TierChoice) ? (tier as TierChoice) : DEFAULT_DEVICE_SETTINGS.tier,
    showTableTalk: typeof showTableTalk === 'boolean' ? showTableTalk : DEFAULT_DEVICE_SETTINGS.showTableTalk,
  };
}

export function loadDeviceSettings(storage: Pick<Storage, 'getItem'> | undefined): DeviceSettings {
  try {
    return parseDeviceSettings(storage?.getItem(KEY) ?? null);
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
}

export function saveDeviceSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: DeviceSettings): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
    return storage !== undefined;
  } catch {
    return false;
  }
}

/** The tier in force: the person's choice, or what the device measured. */
export function effectiveTier(choice: TierChoice, measured: DeviceTier): DeviceTier {
  return choice === 'auto' ? measured : choice;
}
