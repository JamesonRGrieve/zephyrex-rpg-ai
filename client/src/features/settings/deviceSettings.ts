// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings that belong to this device, not to the person's records: how much the device should do
 * (the tier, docs/SUITE.md Mobile and PWA), whether table talk shows in the story column, and how
 * the chat looks here (A49: its layout and text size). Kept in
 * the browser's storage, read through guards: a private window or blocked storage gives the defaults.
 */
import type { DeviceTier } from '~/features/device/tier';

export type TierChoice = 'auto' | DeviceTier;

export const CHAT_LAYOUTS = ['flat', 'bubbles', 'document'] as const;
export type ChatLayout = (typeof CHAT_LAYOUTS)[number];
export const TEXT_SIZES = ['small', 'normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface DeviceSettings {
  tier: TierChoice;
  showTableTalk: boolean;
  chatLayout: ChatLayout;
  textSize: TextSize;
  /** Read each character's reply aloud when it is written (A29). */
  readAloud: boolean;
  /** Show the speaker's expression sprite on a stage above the composer (A4). */
  showExpressions: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { tier: 'auto', showTableTalk: true, chatLayout: 'flat', textSize: 'normal', readAloud: false, showExpressions: true };

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);

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
    tier: oneOf(TIERS, tier, DEFAULT_DEVICE_SETTINGS.tier),
    showTableTalk: typeof showTableTalk === 'boolean' ? showTableTalk : DEFAULT_DEVICE_SETTINGS.showTableTalk,
    chatLayout: oneOf(CHAT_LAYOUTS, Reflect.get(Object(stored), 'chatLayout'), DEFAULT_DEVICE_SETTINGS.chatLayout),
    textSize: oneOf(TEXT_SIZES, Reflect.get(Object(stored), 'textSize'), DEFAULT_DEVICE_SETTINGS.textSize),
    readAloud: Reflect.get(Object(stored), 'readAloud') === true,
    showExpressions: Reflect.get(Object(stored), 'showExpressions') !== false,
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
