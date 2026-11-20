// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern lorebooks in and out (feature A14): a World Info file (`{ entries: { "0": {...} } }`,
 * SillyTavern's own field names and numeric codes) and a Character Card V2/V3 `character_book`
 * (the spec's fields, with SillyTavern's extras under each entry's `extensions`). Pure: JSON in,
 * this app's entry fields out, and a World Info file back.
 */
import { LORE } from '~/contract';
import type { LoreEntry } from '~/features/lore/activate';

/** An entry's fields as the API takes them (no id: the server gives one). */
export type EntryFields = Omit<LoreEntry, 'id'> & { comment: string };

export interface ImportedLorebook {
  name: string;
  description: string;
  entries: EntryFields[];
}

// SillyTavern's numeric codes, in its order.
const POSITIONS = ['before_char', 'after_char', 'before_an', 'after_an', 'at_depth', 'before_example', 'after_example'] as const;
const LOGIC = ['and_any', 'not_all', 'not_any', 'and_all'] as const;
const ROLES = ['system', 'user', 'assistant'] as const;

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const texts = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
const flag = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const maybeFlag = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const whole = (value: unknown, fallback: number, key: keyof typeof LORE.ranges): number => {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  const [low, high] = LORE.ranges[key];
  return Math.min(high, Math.max(low, number));
};
const coded = <T extends string>(codes: readonly T[], value: unknown, fallback: T): T => {
  if (typeof value === 'number') return codes[value] ?? fallback;
  return typeof value === 'string' && (codes as readonly string[]).includes(value) ? (value as T) : fallback;
};

/** One entry from SillyTavern's World Info fields (or a card book's, whose extras sit in `extensions`). */
function entryFrom(raw: Record<string, unknown>, cardBook: boolean): EntryFields {
  const extra = cardBook ? object(raw.extensions) : raw;
  const D = LORE.defaults;
  const filter = object(extra.characterFilter ?? raw.characterFilter);
  const probability = whole(extra.probability ?? raw.probability, D.probability, 'probability');
  const useProbability = flag(extra.useProbability ?? raw.useProbability, true);
  return {
    comment: text(raw.comment) || text(raw.name),
    keys: texts(cardBook ? raw.keys : raw.key),
    secondary_keys: texts(cardBook ? raw.secondary_keys : raw.keysecondary),
    selective_logic: coded(LOGIC, extra.selectiveLogic ?? raw.selectiveLogic, 'and_any'),
    content: text(raw.content),
    enabled: cardBook ? flag(raw.enabled, true) : !flag(raw.disable),
    constant: flag(raw.constant),
    position: coded(POSITIONS, extra.position ?? raw.position, 'after_char'),
    depth: whole(extra.depth ?? raw.depth, D.depth, 'depth'),
    role: coded(ROLES, extra.role ?? raw.role, 'system'),
    order: whole(cardBook ? raw.insertion_order : raw.order, D.order, 'order'),
    probability: useProbability ? probability : 100,
    group: text(extra.group ?? raw.group),
    group_weight: whole(extra.group_weight ?? extra.groupWeight ?? raw.groupWeight, D.group_weight, 'group_weight'),
    prioritize: flag(extra.group_override ?? extra.groupOverride ?? raw.groupOverride),
    sticky: whole(extra.sticky ?? raw.sticky, 0, 'timed'),
    cooldown: whole(extra.cooldown ?? raw.cooldown, 0, 'timed'),
    delay: whole(extra.delay ?? raw.delay, 0, 'timed'),
    exclude_recursion: flag(extra.exclude_recursion ?? extra.excludeRecursion ?? raw.excludeRecursion),
    prevent_recursion: flag(extra.prevent_recursion ?? extra.preventRecursion ?? raw.preventRecursion),
    delay_until_recursion: flag(extra.delay_until_recursion ?? extra.delayUntilRecursion ?? raw.delayUntilRecursion),
    case_sensitive: maybeFlag(cardBook ? raw.case_sensitive : raw.caseSensitive),
    match_whole_words: maybeFlag(extra.match_whole_words ?? extra.matchWholeWords ?? raw.matchWholeWords),
    character_names: texts(filter.names),
    character_exclude: flag(filter.isExclude),
  };
}

/** A SillyTavern World Info file, or a card's `character_book`, as this app's lorebook. */
export function lorebookFromJson(json: unknown, fallbackName: string): ImportedLorebook {
  const root = object(json);
  // A whole card: its book is under data.character_book.
  const book = object(object(root.data).character_book ?? root.character_book ?? root);
  const cardBook = Array.isArray(book.entries);
  const raw = cardBook ? (book.entries as unknown[]) : Object.values(object(book.entries));
  if (raw.length === 0 && !cardBook) throw new Error('This file has no lorebook entries');
  return {
    name: text(book.name) || fallbackName,
    description: text(book.description),
    entries: raw.map((entry) => entryFrom(object(entry), cardBook)),
  };
}

/** A lorebook as a SillyTavern World Info file. */
export function lorebookToJson(book: { name: string; description: string }, entries: readonly EntryFields[]): Record<string, unknown> {
  return {
    name: book.name,
    description: book.description,
    entries: Object.fromEntries(
      entries.map((entry, uid) => [
        String(uid),
        {
          uid,
          key: entry.keys,
          keysecondary: entry.secondary_keys,
          comment: entry.comment,
          content: entry.content,
          constant: entry.constant,
          selective: entry.secondary_keys.length > 0,
          selectiveLogic: LOGIC.indexOf(entry.selective_logic),
          order: entry.order,
          position: POSITIONS.indexOf(entry.position),
          disable: !entry.enabled,
          depth: entry.depth,
          role: ROLES.indexOf(entry.role),
          probability: entry.probability,
          useProbability: entry.probability < 100,
          group: entry.group,
          groupWeight: entry.group_weight,
          groupOverride: entry.prioritize,
          sticky: entry.sticky,
          cooldown: entry.cooldown,
          delay: entry.delay,
          excludeRecursion: entry.exclude_recursion,
          preventRecursion: entry.prevent_recursion,
          delayUntilRecursion: entry.delay_until_recursion,
          caseSensitive: entry.case_sensitive,
          matchWholeWords: entry.match_whole_words,
          characterFilter: { names: entry.character_names, isExclude: entry.character_exclude, tags: [] },
        },
      ]),
    ),
  };
}

/** A lorebook as a Character Card V2 `character_book` (spec fields, SillyTavern's extras in `extensions`). */
export function characterBookFromEntries(book: { name: string; description: string }, entries: readonly EntryFields[]): Record<string, unknown> {
  return {
    name: book.name,
    description: book.description,
    extensions: {},
    entries: entries.map((entry, id) => ({
      id,
      keys: entry.keys,
      secondary_keys: entry.secondary_keys,
      comment: entry.comment,
      content: entry.content,
      constant: entry.constant,
      selective: entry.secondary_keys.length > 0,
      insertion_order: entry.order,
      enabled: entry.enabled,
      position: entry.position === 'before_char' ? 'before_char' : 'after_char',
      case_sensitive: entry.case_sensitive,
      extensions: {
        position: POSITIONS.indexOf(entry.position),
        selectiveLogic: LOGIC.indexOf(entry.selective_logic),
        depth: entry.depth,
        role: ROLES.indexOf(entry.role),
        probability: entry.probability,
        useProbability: entry.probability < 100,
        group: entry.group,
        group_weight: entry.group_weight,
        group_override: entry.prioritize,
        sticky: entry.sticky,
        cooldown: entry.cooldown,
        delay: entry.delay,
        exclude_recursion: entry.exclude_recursion,
        prevent_recursion: entry.prevent_recursion,
        delay_until_recursion: entry.delay_until_recursion,
        match_whole_words: entry.match_whole_words,
        characterFilter: { names: entry.character_names, isExclude: entry.character_exclude },
      },
    })),
  };
}
