// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * World Info over the wiki (the composed suite, docs/DESIGN.md): the wiki's world entities as the
 * lore entries activateLore reads, so SillyTavern's activation (keys, recursion, timed effects) runs
 * over wiki records. Pure, and held to contract/world-lore-cases.json, which the SaaS server's
 * WorldLore.py runs too.
 *
 * Keys are an entity's name, aliases and keywords (each once, in its first spelling); content its
 * summary. Its lore block (wiki S4d) sets the rest; what it leaves out takes the wiki's lore
 * defaults. Deleted entities, entities with nothing to say, and `outlet` entries (placed only by an
 * {{outlet}} macro, which this app doesn't have yet) are left out. A chat's wiki campaign, for the
 * window before campaign frames go, is a frame's wiki campaign when the chat names a frame.
 */
import { type LorePosition, type SelectiveLogic, WORLD_LORE } from '~/contract';
import type { LoreEntry } from './activate';

export interface WorldEntity {
  id: string;
  name: string;
  aliases?: readonly string[];
  keywords?: readonly string[];
  summary?: string;
  deleted?: boolean;
  lore?: Readonly<Record<string, unknown>> | null;
}

/** The name, aliases and keywords, trimmed, empty ones dropped, each kept once in its first spelling. */
export function worldKeys(entity: Pick<WorldEntity, 'name' | 'aliases' | 'keywords'>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const raw of [entity.name, ...(entity.aliases ?? []), ...(entity.keywords ?? [])]) {
    const key = raw.trim();
    if (key !== '' && !seen.has(key.toLowerCase())) {
      seen.add(key.toLowerCase());
      keys.push(key);
    }
  }
  return keys;
}

const DEFAULTS = WORLD_LORE.lore_defaults;
const POSITIONS: Readonly<Record<string, string>> = WORLD_LORE.positions;
const LOGICS = ['and_any', 'not_all', 'not_any', 'and_all'];

/** The lore entry an entity is, or null when it's left out. */
export function worldLoreEntry(entity: WorldEntity): LoreEntry | null {
  const summary = (entity.summary ?? '').trim();
  if (entity.deleted === true || summary === '') return null;
  const lore = entity.lore ?? {};
  // An outlet entry goes only where an {{outlet}} macro puts it, which this app doesn't have yet.
  if (lore.position === 'outlet') return null;
  const pick = <K extends keyof typeof DEFAULTS>(key: K, ok: (value: unknown) => boolean): (typeof DEFAULTS)[K] =>
    (ok(lore[key]) ? lore[key] : DEFAULTS[key]) as (typeof DEFAULTS)[K];
  const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  const position = pick('position', (value) => typeof value === 'string' && value in POSITIONS);
  const mapped = POSITIONS[position];
  if (mapped === undefined) return null;
  return {
    id: entity.id,
    keys: worldKeys(entity),
    secondary_keys: [
      ...pick('secondary_keys', (value) => Array.isArray(value) && value.every((key) => typeof key === 'string')),
    ],
    selective_logic: pick(
      'selective_logic',
      (value) => typeof value === 'string' && LOGICS.includes(value),
    ) as SelectiveLogic,
    content: summary,
    enabled: true,
    constant: pick('always_active', (value) => typeof value === 'boolean'),
    position: mapped as LorePosition,
    depth: pick('depth', isNumber),
    role: 'system',
    order: pick('order', isNumber),
    probability: pick('probability', isNumber),
    group: pick('group', (value) => typeof value === 'string'),
    group_weight: pick('group_weight', isNumber),
    prioritize: false,
    sticky: pick('sticky', isNumber),
    cooldown: pick('cooldown', isNumber),
    delay: pick('delay', isNumber),
    exclude_recursion: false,
    prevent_recursion: false,
    delay_until_recursion: false,
    case_sensitive: null,
    match_whole_words: null,
    character_names: [],
    character_exclude: false,
  };
}

/** Every entity's lore entry, in the wiki's order, those left out dropped. */
export function worldLoreEntries(entities: readonly WorldEntity[]): LoreEntry[] {
  return entities.flatMap((entity) => {
    const entry = worldLoreEntry(entity);
    return entry === null ? [] : [entry];
  });
}

/**
 * A chat's wiki campaign: its campaign_id, or, while campaign frames remain, the wiki campaign of
 * the frame it names. Remove with the frames.
 */
export function wikiCampaignOf(campaignId: string | null, frames: ReadonlyMap<string, string | null>): string | null {
  if (campaignId === null) return null;
  return frames.has(campaignId) ? (frames.get(campaignId) ?? null) : campaignId;
}

/**
 * The campaign's own entities, and of a setting's canon only those whose name or an alias the text says
 * word for word (the operator, 2026-11-22: "Why is it reading the whole world instead of tag/relevance
 * based injection?"; the 5e SRD's 2,287 records were scanned every prompt).
 */
export function canonInReach<T extends { name: string; aliases?: readonly string[]; canon?: boolean }>(
  entities: readonly T[],
  text: string,
): T[] {
  const words = (value: string): string => (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
  const said = ` ${words(text)} `;
  const named = (entity: T): boolean =>
    [entity.name, ...(entity.aliases ?? [])].some((name) => {
      const form = words(name);
      return form !== '' && said.includes(` ${form} `);
    });
  return entities.filter((entity) => entity.canon !== true || named(entity));
}
