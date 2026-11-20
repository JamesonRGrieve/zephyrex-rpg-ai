// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which lorebook (World Info) entries a reply gets, and where they go. Pure, and held to the cases
 * in contract/lore-cases.json, which the SaaS server's twin (server/extensions/ai_chat/Lore.py)
 * runs too.
 *
 * 1. Eligible: enabled, the character filter passes, `delay` messages have been written, and not
 *    cooling down. An entry inside its `sticky` window is active whatever the text says.
 * 2. Matched against the last `scan_depth` story messages: a constant always; otherwise any primary
 *    key, then the secondary keys by `selective_logic`. A key is a substring (case and whole words
 *    by the entry, else the settings) or a `/regex/flags`.
 * 3. Recursion: new entries' content (unless `prevent_recursion`) is scanned again, up to
 *    `recursion_steps` times; `exclude_recursion` entries are never activated that way, and
 *    `delay_until_recursion` entries only that way.
 * 4. Probability, then inclusion groups (a prioritized member wins outright, else a weighted pick),
 *    with the draws supplied by the caller in a fixed order.
 * 5. The token budget keeps the highest-order entries that fit.
 * 6. Timed effects: a fresh sticky entry stays `sticky` messages; an entry with `cooldown` rests that
 *    long once it (or its sticky window) ends.
 */
import { type DepthRole, type LorePosition, PROMPT, type SelectiveLogic } from '~/contract';

export interface LoreEntry {
  id: string;
  keys: string[];
  secondary_keys: string[];
  selective_logic: SelectiveLogic;
  content: string;
  enabled: boolean;
  constant: boolean;
  position: LorePosition;
  depth: number;
  role: DepthRole;
  order: number;
  probability: number;
  group: string;
  group_weight: number;
  prioritize: boolean;
  sticky: number;
  cooldown: number;
  delay: number;
  exclude_recursion: boolean;
  prevent_recursion: boolean;
  delay_until_recursion: boolean;
  case_sensitive: boolean | null;
  match_whole_words: boolean | null;
  character_names: string[];
  character_exclude: boolean;
}

export interface LoreSettings {
  scan_depth: number;
  token_budget: number;
  recursion_steps: number;
  case_sensitive: boolean;
  match_whole_words: boolean;
}

export interface TimedState {
  sticky_until: number;
  cooldown_until: number;
}

export type LoreState = Record<string, TimedState>;

export interface DepthInsert {
  depth: number;
  role: DepthRole;
  content: string;
}

export interface LoreResult {
  active: string[];
  sections: Partial<Record<Exclude<LorePosition, 'at_depth'>, string>>;
  at_depth: DepthInsert[];
  state: LoreState;
}

const REGEX_KEY = /^\/(.+)\/([a-z]*)$/s;

export function loreTokens(text: string): number {
  return Math.ceil(text.length / PROMPT.characters_per_token);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function keyMatches(key: string, text: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  const regex = REGEX_KEY.exec(key);
  if (regex !== null) {
    try {
      return new RegExp(regex[1], regex[2].includes('i') ? 'i' : '').test(text);
    } catch {
      return false;
    }
  }
  if (key === '') return false;
  if (wholeWords) return new RegExp(`(?<!\\w)${escapeRegex(key)}(?!\\w)`, caseSensitive ? '' : 'i').test(text);
  return caseSensitive ? text.includes(key) : text.toLowerCase().includes(key.toLowerCase());
}

function matches(entry: LoreEntry, text: string, settings: LoreSettings): boolean {
  if (entry.constant) return true;
  const caseSensitive = entry.case_sensitive ?? settings.case_sensitive;
  const wholeWords = entry.match_whole_words ?? settings.match_whole_words;
  const hit = (key: string) => keyMatches(key, text, caseSensitive, wholeWords);
  if (!entry.keys.some(hit)) return false;
  if (entry.secondary_keys.length === 0) return true;
  const hits = entry.secondary_keys.map(hit);
  switch (entry.selective_logic) {
    case 'and_any':
      return hits.some(Boolean);
    case 'and_all':
      return hits.every(Boolean);
    case 'not_any':
      return !hits.some(Boolean);
    default:
      return !hits.every(Boolean);
  }
}

const byOrder = (a: LoreEntry, b: LoreEntry) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const ranked = (entries: readonly LoreEntry[]) => [...entries].sort(byOrder);

/** The new entries one recursion pass activates, scanning `text`. */
function recursionPass(candidates: readonly LoreEntry[], activated: ReadonlyMap<string, LoreEntry>, text: string, settings: LoreSettings): LoreEntry[] {
  return candidates.filter((entry) => !activated.has(entry.id) && !entry.exclude_recursion && matches(entry, text, settings));
}

function pickFromGroup(members: readonly LoreEntry[], roll: () => number): LoreEntry {
  const prioritized = members.filter((member) => member.prioritize);
  if (prioritized.length > 0) {
    return [...prioritized].sort((a, b) => b.order - a.order || (a.id < b.id ? -1 : 1))[0] as LoreEntry;
  }
  const total = members.reduce((sum, member) => sum + member.group_weight, 0);
  const draw = roll() * total;
  let running = 0;
  for (const member of members) {
    running += member.group_weight;
    if (draw < running) return member;
  }
  return members[members.length - 1] as LoreEntry;
}

export function activateLore(
  entries: readonly LoreEntry[],
  history: readonly string[],
  messageCount: number,
  speaker: string,
  state: Readonly<LoreState>,
  settings: LoreSettings,
  roll: () => number,
): LoreResult {
  const eligible = (entry: LoreEntry): boolean => {
    if (!entry.enabled) return false;
    if (entry.character_names.length > 0 && entry.character_names.includes(speaker) === entry.character_exclude) return false;
    if (messageCount < entry.delay) return false;
    return (state[entry.id]?.cooldown_until ?? 0) <= messageCount;
  };
  const candidates = ranked(entries).filter(eligible);
  const stickyHeld = new Set(candidates.filter((entry) => (state[entry.id]?.sticky_until ?? 0) > messageCount).map((entry) => entry.id));
  const buffer = settings.scan_depth > 0 ? history.slice(-settings.scan_depth).join('\n') : '';

  const activated = new Map<string, LoreEntry>();
  let fresh = candidates.filter((entry) => stickyHeld.has(entry.id) || (!entry.delay_until_recursion && matches(entry, buffer, settings)));
  for (const entry of fresh) activated.set(entry.id, entry);
  for (let step = 0; step < settings.recursion_steps; step += 1) {
    const text = fresh
      .filter((entry) => !entry.prevent_recursion)
      .map((entry) => entry.content)
      .join('\n');
    if (text === '') break;
    fresh = recursionPass(candidates, activated, text, settings);
    if (fresh.length === 0) break;
    for (const entry of fresh) activated.set(entry.id, entry);
  }

  // Probability: one draw per uncertain entry, in order.
  const kept = ranked([...activated.values()]).filter(
    (entry) => stickyHeld.has(entry.id) || entry.probability >= 100 || roll() < entry.probability / 100,
  );

  // Inclusion groups: one member each, groups by name.
  const groups = new Map<string, LoreEntry[]>();
  for (const entry of kept) if (entry.group !== '') groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  const dropped = new Set<string>();
  for (const name of [...groups.keys()].sort()) {
    const members = groups.get(name) ?? [];
    if (members.length < 2) continue;
    const winner = pickFromGroup(members, roll);
    for (const member of members) if (member.id !== winner.id) dropped.add(member.id);
  }

  // Budget: the highest-order entries that fit.
  let used = 0;
  const fitted: LoreEntry[] = [];
  for (const entry of kept.filter((one) => !dropped.has(one.id)).sort((a, b) => b.order - a.order || (a.id < b.id ? -1 : 1))) {
    const cost = loreTokens(entry.content);
    if (used + cost <= settings.token_budget) {
      used += cost;
      fitted.push(entry);
    }
  }
  const final = ranked(fitted);

  const sections: LoreResult['sections'] = {};
  const depths = new Map<string, DepthInsert>();
  for (const entry of final) {
    if (entry.position === 'at_depth') {
      const key = `${entry.depth}\u0000${entry.role}`;
      const existing = depths.get(key);
      depths.set(key, { depth: entry.depth, role: entry.role, content: existing === undefined ? entry.content : `${existing.content}\n${entry.content}` });
    } else {
      const existing = sections[entry.position];
      sections[entry.position] = existing === undefined ? entry.content : `${existing}\n${entry.content}`;
    }
  }
  const atDepth = [...depths.values()].sort((a, b) => b.depth - a.depth || (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));

  const next: LoreState = Object.fromEntries(Object.entries(state).map(([id, timed]) => [id, { ...timed }]));
  for (const entry of final) {
    if (stickyHeld.has(entry.id)) continue;
    if (entry.sticky > 0) next[entry.id] = { sticky_until: messageCount + entry.sticky, cooldown_until: 0 };
    else if (entry.cooldown > 0) next[entry.id] = { sticky_until: 0, cooldown_until: messageCount + entry.cooldown };
  }
  // A sticky window that has ended starts its entry's cooldown.
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const [id, timed] of Object.entries(next)) {
    const entry = byId.get(id);
    const ended = timed.sticky_until > 0 && timed.sticky_until <= messageCount;
    if (entry !== undefined && ended && entry.cooldown > 0 && timed.cooldown_until <= messageCount) {
      next[id] = { sticky_until: 0, cooldown_until: timed.sticky_until + entry.cooldown };
    }
  }

  return { active: final.map((entry) => entry.id).sort(), sections, at_depth: atDepth, state: next };
}
