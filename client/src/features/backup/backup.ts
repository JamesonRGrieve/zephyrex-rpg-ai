// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Backups (A56): every record as one file, and back. A restore writes through the API (so it works on
 * both editions), resource by resource in the order their references need, giving each record a new
 * id and pointing every reference at the new ids. Pure: the plan and the remapping; the page does the
 * reading and writing.
 *
 * Model endpoints travel without their API keys (write-only, never read back), so a restored model
 * asks for its key again.
 */

export const BACKUP_FORMAT = 'zephyrex-rpg-ai-backup';
export const BACKUP_VERSION = 1;

/** How a field of a record points at another record. */
type Ref =
  | { field: string; resource: string; many?: boolean }
  | { field: string; scopeField: string; byScope: Record<string, string> };

export interface BackupResource {
  /** The singular name (paths and bodies). */
  resource: string;
  /** The plural lists answer with. */
  plural: string;
  refs: readonly Ref[];
  /** Fields never written back (server-set or write-only). */
  drop?: readonly string[];
}

/** The resources, in the order a restore writes them: whatever a record points at comes first. */
export const BACKUP_RESOURCES: readonly BackupResource[] = [
  { resource: 'persona', plural: 'personae', refs: [] },
  { resource: 'lorebook', plural: 'lorebooks', refs: [] },
  { resource: 'lorebook_entry', plural: 'lorebook_entries', refs: [{ field: 'lorebook_id', resource: 'lorebook' }] },
  { resource: 'character', plural: 'characters', refs: [{ field: 'lorebook_id', resource: 'lorebook' }] },
  { resource: 'generation_preset', plural: 'generation_presets', refs: [] },
  { resource: 'model_endpoint', plural: 'model_endpoints', refs: [], drop: ['has_api_key'] },
  { resource: 'campaign_frame', plural: 'campaign_frames', refs: [] },
  { resource: 'scenario', plural: 'scenarios', refs: [{ field: 'campaign_id', resource: 'campaign_frame' }] },
  { resource: 'regex_script', plural: 'regex_scripts', refs: [] },
  { resource: 'quick_reply', plural: 'quick_replies', refs: [] },
  {
    resource: 'connection_profile',
    plural: 'connection_profiles',
    refs: [
      { field: 'endpoint_id', resource: 'model_endpoint' },
      { field: 'preset_id', resource: 'generation_preset' },
    ],
  },
  {
    resource: 'chat',
    plural: 'chats',
    refs: [
      { field: 'character_ids', resource: 'character', many: true },
      { field: 'muted_ids', resource: 'character', many: true },
      { field: 'lorebook_ids', resource: 'lorebook', many: true },
      { field: 'persona_id', resource: 'persona' },
      { field: 'preset_id', resource: 'generation_preset' },
      { field: 'endpoint_id', resource: 'model_endpoint' },
      { field: 'campaign_id', resource: 'campaign_frame' },
      { field: 'scenario_id', resource: 'scenario' },
    ],
  },
  {
    resource: 'chat_message',
    plural: 'chat_messages',
    refs: [
      { field: 'chat_id', resource: 'chat' },
      { field: 'parent_id', resource: 'chat_message' },
      { field: 'speaker_character_id', resource: 'character' },
    ],
  },
  {
    resource: 'data_document',
    plural: 'data_documents',
    refs: [{ field: 'scope_id', scopeField: 'scope', byScope: { chat: 'chat', character: 'character' } }],
  },
];

/** Fields every record carries that the server sets. */
const SERVER_SET = ['id', 'created_at', 'updated_at', 'created_by_user_id', 'updated_by_user_id'];

export type BackupRecord = Record<string, unknown> & { id: string };

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  records: Record<string, BackupRecord[]>;
}

export function makeBackup(records: Record<string, BackupRecord[]>, now: Date = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: now.toISOString(), records };
}

export class BackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFileError';
  }
}

export function readBackup(json: unknown): Backup {
  if (Reflect.get(Object(json), 'format') !== BACKUP_FORMAT)
    throw new BackupFileError('This is not a Zephyrex RPG AI backup');
  if (Reflect.get(Object(json), 'version') !== BACKUP_VERSION)
    throw new BackupFileError('This backup is from another version');
  const records: unknown = Reflect.get(Object(json), 'records');
  if (typeof records !== 'object' || records === null) throw new BackupFileError('This backup holds no records');
  return json as Backup;
}

/** A message's ancestors come before it, so every parent exists when its children are written. */
export function parentsFirst(messages: readonly BackupRecord[]): BackupRecord[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const placed = new Set<string>();
  const order: BackupRecord[] = [];
  const place = (message: BackupRecord, seen: ReadonlySet<string>): void => {
    if (placed.has(message.id) || seen.has(message.id)) return;
    const parent = typeof message.parent_id === 'string' ? byId.get(message.parent_id) : undefined;
    if (parent !== undefined) place(parent, new Set(seen).add(message.id));
    placed.add(message.id);
    order.push(message);
  };
  for (const message of messages) place(message, new Set());
  return order;
}

/**
 * The fields to write for `record`, its references pointed at the new ids (`ids`, by resource then
 * old id). A reference to a record that was not restored becomes null (or is left out of a list).
 */
export function restoredFields(
  spec: BackupResource,
  record: BackupRecord,
  ids: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Record<string, unknown> {
  const dropped = new Set([...SERVER_SET, ...(spec.drop ?? [])]);
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.has(key)));
  for (const ref of spec.refs) {
    const target = 'scopeField' in ref ? ref.byScope[String(record[ref.scopeField])] : ref.resource;
    const value = record[ref.field];
    const map = target === undefined ? undefined : ids.get(target);
    if ('many' in ref && ref.many === true) {
      fields[ref.field] = Array.isArray(value)
        ? value.flatMap((old) => (typeof old === 'string' && map?.has(old) === true ? [map.get(old)] : []))
        : [];
    } else if (typeof value === 'string') {
      fields[ref.field] = map?.get(value) ?? null;
    }
  }
  return fields;
}
