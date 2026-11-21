// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A lorebook kept in sync with the wiki (A15): given the book's entries and a page of the wiki's
 * `world_entities` (in order), what to create, update and remove. Each wiki entity has one entry,
 * linked by `wiki_entity_id`: its comment is the entity's name, its keys the name and aliases, its
 * content the summary. Entries the person wrote themselves are never touched. The server twin is
 * server/extensions/ai_lorebook/WikiSync.py; both run contract/wiki-sync-cases.json.
 */

export interface WikiEntity {
  id: string;
  kind: string;
  name: string;
  aliases: readonly string[];
  summary: string;
  deleted: boolean;
}

export interface SyncedEntry {
  id: string;
  /** The wiki entity it was made from; null for an entry the person wrote. */
  wiki_entity_id: string | null;
  comment: string;
  keys: readonly string[];
  content: string;
}

export interface EntryText {
  comment: string;
  keys: string[];
  content: string;
}

export interface SyncPlan {
  create: (EntryText & { wiki_entity_id: string })[];
  update: (EntryText & { id: string })[];
  remove: string[];
}

/** The name and aliases, trimmed, empty ones dropped, each kept once in its first spelling. */
export function entityKeys(entity: Pick<WikiEntity, 'name' | 'aliases'>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const raw of [entity.name, ...entity.aliases]) {
    const key = raw.trim();
    const folded = key.toLowerCase();
    if (key !== '' && !seen.has(folded)) {
      seen.add(folded);
      keys.push(key);
    }
  }
  return keys;
}

const entryText = (entity: WikiEntity): EntryText => ({
  comment: entity.name.trim(),
  keys: entityKeys(entity),
  content: entity.summary,
});

const sameText = (entry: SyncedEntry, text: EntryText): boolean =>
  entry.comment === text.comment &&
  entry.content === text.content &&
  entry.keys.length === text.keys.length &&
  entry.keys.every((key, index) => key === text.keys[index]);

/** What to change in the book for one page of the wiki's entities. */
export function syncPlan(entries: readonly SyncedEntry[], entities: readonly WikiEntity[]): SyncPlan {
  // An entity listed twice changed during the sync: its last listing is the current one.
  const latest = new Map<string, WikiEntity>();
  for (const entity of entities) {
    latest.delete(entity.id);
    latest.set(entity.id, entity);
  }
  const linked = new Map<string, SyncedEntry[]>();
  for (const entry of entries) {
    if (entry.wiki_entity_id !== null) {
      linked.set(entry.wiki_entity_id, [...(linked.get(entry.wiki_entity_id) ?? []), entry]);
    }
  }
  const plan: SyncPlan = { create: [], update: [], remove: [] };
  for (const entity of latest.values()) {
    const [kept, ...extra] = linked.get(entity.id) ?? [];
    plan.remove.push(...extra.map((entry) => entry.id));
    if (entity.deleted) {
      if (kept !== undefined) plan.remove.push(kept.id);
      continue;
    }
    const text = entryText(entity);
    if (kept === undefined) plan.create.push({ wiki_entity_id: entity.id, ...text });
    else if (!sameText(kept, text)) plan.update.push({ id: kept.id, ...text });
  }
  return plan;
}
