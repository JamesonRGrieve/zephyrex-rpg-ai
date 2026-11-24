// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A group chat's modes (audit gap 6), stored as the chat's `group_settings`: card_mode (swap or
 * join), join_prefix and join_suffix, order (natural, list or pooled), allow_self, auto_seconds and
 * scenario. Each is optional; an absent one keeps the default. Pure, and held to
 * contract/group-settings-cases.json, which the SaaS server's GroupSettings.py runs too.
 */
import { GROUP_SETTINGS } from '~/contract';

export type GroupSettings = {
  card_mode?: (typeof GROUP_SETTINGS.card_modes)[number];
  join_prefix?: string;
  join_suffix?: string;
  order?: (typeof GROUP_SETTINGS.orders)[number];
  allow_self?: boolean;
  auto_seconds?: number;
  scenario?: string;
  /**
   * Multi-actor turns (the operator, 2026-11-24: "a setting for multi-actor turns that can be toggled off so
   * each character turn (/narrator) is one model call"): on (the default), one turn may voice several people;
   * off, each model call is one actor's: a character's turn writes only that character, the narrator only
   * narrates, and anyone else who speaks gets their own turn.
   */
  multi_actor?: boolean;
};

const KEYS = ['card_mode', 'join_prefix', 'join_suffix', 'order', 'allow_self', 'auto_seconds', 'scenario', 'multi_actor'];
const chars = (text: string) => Array.from(text).length;

/** Why `value` can't be kept as a chat's group settings, or null. */
export function groupSettingsProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Group settings are an object';
  const settings = value as Record<string, unknown>;
  const unknown = Object.keys(settings).filter((key) => !KEYS.includes(key));
  if (unknown.length > 0) return `${unknown.join(', ')} isn't a group setting`;
  const { card_mode: cardMode, order, allow_self: allowSelf, auto_seconds: autoSeconds, scenario } = settings;
  if (cardMode !== undefined && !(GROUP_SETTINGS.card_modes as readonly unknown[]).includes(cardMode))
    return `card_mode is ${GROUP_SETTINGS.card_modes.join(' or ')}`;
  if (order !== undefined && !(GROUP_SETTINGS.orders as readonly unknown[]).includes(order))
    return `order is ${GROUP_SETTINGS.orders.join(', ')}`;
  if (allowSelf !== undefined && typeof allowSelf !== 'boolean') return 'allow_self is true or false';
  if (settings.multi_actor !== undefined && typeof settings.multi_actor !== 'boolean')
    return 'multi_actor is true or false';
  const [low, high] = GROUP_SETTINGS.auto_seconds;
  if (
    autoSeconds !== undefined &&
    (typeof autoSeconds !== 'number' || !Number.isInteger(autoSeconds) || autoSeconds < low || autoSeconds > high)
  )
    return `auto_seconds is a whole number from ${low} to ${high}`;
  for (const key of ['join_prefix', 'join_suffix'] as const) {
    const affix = settings[key];
    if (affix !== undefined && (typeof affix !== 'string' || chars(affix) > GROUP_SETTINGS.affix_characters))
      return `${key} is text of at most ${GROUP_SETTINGS.affix_characters} characters`;
  }
  if (scenario !== undefined && (typeof scenario !== 'string' || chars(scenario) > GROUP_SETTINGS.scenario_characters))
    return `scenario is text of at most ${GROUP_SETTINGS.scenario_characters} characters`;
  return null;
}
