// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The records the UI reads and writes, through the framework client: the same calls whichever back
 * end answers. Every change is guarded by the version the person saw (If-Match), so a stale one
 * surfaces as a conflict, never a silent overwrite.
 *
 * One factory (`resource`) gives each resource its list, single-record and change hooks, so a
 * resource is declared once: its paths and its schema.
 */
import useSWR, { type SWRResponse, useSWRConfig } from 'swr';
import { useClient } from 'zephyrex';
import { z } from 'zod';
import {
  CAMPAIGN,
  CHAT_MODES,
  DATA_BANK,
  DEPTH_ROLES,
  LORE_POSITIONS,
  MESSAGE_CHANNELS,
  MESSAGE_ROLES,
  PROMPT,
  QUICK_REPLY,
  REGEX,
  SAFETY,
  TABLE,
  SELECTIVE_LOGIC,
  ENDPOINT_KINDS,
  ENDPOINT_ROLES,
  INSTRUCT_TEMPLATES,
  type InstructTemplateId,
} from '~/contract';

const JSON_BODY = z.json();

/** A record's id: one function for every list, so hooks keyed on it (useHidden) stay stable. */
export const idOf = (record: { id: string }): string => record.id;

/**
 * For useWrites: a record's own actions already have every list of it read again, so a form that
 * writes through them has nothing more to refresh.
 */
export const refreshedByRecords = async (): Promise<void> => {};

/**
 * A request body as the JSON the wire carries (fields left undefined are dropped). Typed form
 * fields hold `unknown` in places (extensions, layouts), which JSON alone can vouch for.
 */
export function jsonBody(value: unknown): z.infer<typeof JSON_BODY> {
  return JSON_BODY.parse(JSON.parse(JSON.stringify(value)) as unknown);
}

const versioned = { id: z.string(), created_at: z.string(), updated_at: z.string().nullable() };

export const characterSchema = z.object({
  ...versioned,
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  first_message: z.string(),
  alternate_greetings: z.array(z.string()),
  example_messages: z.string(),
  system_prompt: z.string(),
  post_history_instructions: z.string(),
  creator_notes: z.string(),
  creator: z.string(),
  character_version: z.string(),
  tags: z.array(z.string()),
  avatar: z.string().nullable(),
  favourite: z.boolean(),
  folder: z.string(),
  extensions: z.record(z.string(), z.unknown()),
  lorebook_id: z.string().nullable(),
});
export type Character = z.infer<typeof characterSchema>;

export const personaSchema = z.object({
  ...versioned,
  name: z.string(),
  description: z.string(),
  avatar: z.string().nullable(),
  is_default: z.boolean(),
});
export type Persona = z.infer<typeof personaSchema>;

export const chatSchema = z.object({
  ...versioned,
  title: z.string(),
  mode: z.enum(CHAT_MODES),
  character_ids: z.array(z.string()),
  persona_id: z.string().nullable(),
  preset_id: z.string().nullable(),
  endpoint_id: z.string().nullable(),
  author_note: z.string(),
  lorebook_ids: z.array(z.string()),
  lore_settings: z.record(z.string(), z.union([z.number(), z.boolean()])),
  system_prompt: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  folder: z.string(),
  muted_ids: z.array(z.string()),
  background: z.string().nullable(),
  objectives: z.array(z.object({ text: z.string(), done: z.boolean() })),
  content_rating: z.enum(SAFETY.ratings).nullable(),
  lines: z.array(z.string()),
  veils: z.array(z.string()),
  table_notes: z.array(z.object({ kind: z.enum(TABLE.note_kinds), text: z.string() })),
  paused: z.boolean(),
  // STscript and macro variables kept with the chat ({{getvar}}, /setvar), name to value.
  variables: z.record(z.string(), z.string()).default({}),
  campaign_id: z.string().nullable(),
  scenario_id: z.string().nullable(),
});
export type Chat = z.infer<typeof chatSchema>;

export const messageSchema = z.object({
  ...versioned,
  chat_id: z.string(),
  parent_id: z.string().nullable(),
  role: z.enum(MESSAGE_ROLES),
  channel: z.enum(MESSAGE_CHANNELS),
  speaker_character_id: z.string().nullable(),
  swipes: z.array(z.string()),
  swipe_index: z.number(),
  bookmarked: z.boolean(),
  images: z.array(z.string()),
  x_carded: z.boolean(),
});
export type ChatMessage = z.infer<typeof messageSchema>;

export const presetSchema = z.object({
  ...versioned,
  name: z.string(),
  temperature: z.number(),
  top_p: z.number(),
  top_k: z.number(),
  repetition_penalty: z.number(),
  max_tokens: z.number(),
  context_tokens: z.number(),
  stop: z.array(z.string()),
  prompt_layout: z.array(z.object({ id: z.enum(PROMPT.sections), enabled: z.boolean(), max_tokens: z.number().nullable() })),
  logit_bias: z.record(z.string(), z.number()),
  negative_prompt: z.string(),
  guidance_scale: z.number().nullable(),
});
export type Preset = z.infer<typeof presetSchema>;

export const endpointSchema = z.object({
  ...versioned,
  name: z.string(),
  base_url: z.string(),
  model: z.string(),
  is_default: z.boolean(),
  has_api_key: z.boolean(),
  api: z.enum(ENDPOINT_KINDS),
  instruct_template: z.enum(Object.keys(INSTRUCT_TEMPLATES) as [InstructTemplateId, ...InstructTemplateId[]]),
  custom_template_id: z.string().nullable(),
  image_size: z.string(),
  roles: z.array(z.enum(ENDPOINT_ROLES)),
});
export type ModelEndpoint = z.infer<typeof endpointSchema>;

type Versioned = { id: string; created_at: string; updated_at: string | null };
/** What a write may set: a record's own fields (and, for write-only fields, `Extra`). */
export type Fields<T extends Versioned, Extra = object> = Partial<Omit<T, keyof Versioned>> & Extra;

/** The record a single-record answer wraps (`{ <resource>: {...} }`). */
function one<T>(schema: z.ZodType<T>, key: string, body: unknown): T {
  return schema.parse(z.record(z.string(), z.unknown()).parse(body)[key]);
}

export interface ResourceHooks<T extends Versioned, Create, Extra> {
  path: string;
  /** The records, read only while `enabled` (by default, always). */
  useList(query?: Record<string, string>, enabled?: boolean): SWRResponse<T[], Error>;
  useOne(id: string | null): SWRResponse<T, Error>;
  useActions(): {
    create(fields: Create): Promise<T>;
    update(seen: T, changes: Fields<T, Extra>): Promise<T>;
    remove(seen: T): Promise<void>;
  };
}

/** A resource's hooks, from its singular name, plural and schema. */
export function resource<T extends Versioned, Create extends object, Extra = object>(
  singular: string,
  plural: string,
  schema: z.ZodType<T>,
): ResourceHooks<T, Create, Extra> {
  const path = `/v1/${singular}`;
  const listKey = (query?: Record<string, string>) =>
    query === undefined || Object.keys(query).length === 0 ? path : `${path}?${new URLSearchParams(query).toString()}`;
  return {
    path,
    useList(query, enabled = true) {
      const client = useClient();
      const key = listKey(query);
      // The query goes as the pager's params: it adds offset and limit to them. Baked into the path,
      // it gained a second `?` and every filtered list came back empty (found by the visual audit).
      return useSWR(enabled ? key : null, () => client.list(path, plural, schema, query ?? {}));
    },
    useOne(id) {
      const client = useClient();
      return useSWR(id === null ? null : `${path}/${id}`, async () =>
        one(schema, singular, await client.get(`${path}/${id ?? ''}`)),
      );
    },
    useActions() {
      const client = useClient();
      const { mutate } = useSWRConfig();
      // A change has every list of this resource, and the record itself, read again.
      const refresh = async (id?: string) => {
        await mutate(
          (key) => typeof key === 'string' && (key === path || key.startsWith(`${path}?`) || key === `${path}/${id ?? ''}`),
        );
      };
      return {
        async create(fields) {
          const saved = one(schema, singular, await client.post(path, jsonBody({ [singular]: fields })));
          await refresh(saved.id);
          return saved;
        },
        async update(seen, changes) {
          const saved = one(
            schema,
            singular,
            await client.put(`${path}/${seen.id}`, jsonBody({ [singular]: changes }), seen),
          );
          await refresh(saved.id);
          return saved;
        },
        async remove(seen) {
          await client.delete(`${path}/${seen.id}`, seen);
          await refresh(seen.id);
        },
      };
    },
  };
}

export const characters = resource<Character, Fields<Character> & { name: string }>(
  'character',
  'characters',
  characterSchema,
);
export const personas = resource<Persona, Fields<Persona> & { name: string }>('persona', 'personae', personaSchema);
export const chats = resource<Chat, Fields<Chat> & { title: string; character_ids: string[] }>('chat', 'chats', chatSchema);
export const messages = resource<
  ChatMessage,
  Pick<ChatMessage, 'chat_id' | 'parent_id' | 'role' | 'swipes'> & Fields<ChatMessage>
>('chat_message', 'chat_messages', messageSchema);
export const presets = resource<Preset, Fields<Preset> & { name: string }>(
  'generation_preset',
  'generation_presets',
  presetSchema,
);
export const endpoints = resource<
  ModelEndpoint,
  Fields<ModelEndpoint, { api_key?: string }> & { name: string; base_url: string; model: string },
  { api_key?: string }
>('model_endpoint', 'model_endpoints', endpointSchema);

export const lorebookSchema = z.object({
  ...versioned,
  name: z.string(),
  description: z.string(),
  wiki_campaign_id: z.string().nullable(),
  wiki_synced_at: z.string().nullable(),
});
export type Lorebook = z.infer<typeof lorebookSchema>;

export const lorebookEntrySchema = z.object({
  ...versioned,
  lorebook_id: z.string(),
  wiki_entity_id: z.string().nullable(),
  comment: z.string(),
  keys: z.array(z.string()),
  secondary_keys: z.array(z.string()),
  selective_logic: z.enum(SELECTIVE_LOGIC),
  content: z.string(),
  enabled: z.boolean(),
  constant: z.boolean(),
  position: z.enum(LORE_POSITIONS),
  depth: z.number(),
  role: z.enum(DEPTH_ROLES),
  order: z.number(),
  probability: z.number(),
  group: z.string(),
  group_weight: z.number(),
  prioritize: z.boolean(),
  sticky: z.number(),
  cooldown: z.number(),
  delay: z.number(),
  exclude_recursion: z.boolean(),
  prevent_recursion: z.boolean(),
  delay_until_recursion: z.boolean(),
  case_sensitive: z.boolean().nullable(),
  match_whole_words: z.boolean().nullable(),
  character_names: z.array(z.string()),
  character_exclude: z.boolean(),
});
export type LorebookEntry = z.infer<typeof lorebookEntrySchema>;

export const lorebooks = resource<Lorebook, Fields<Lorebook> & { name: string }>('lorebook', 'lorebooks', lorebookSchema);
export const lorebookEntries = resource<LorebookEntry, Fields<LorebookEntry> & { lorebook_id: string }>(
  'lorebook_entry',
  'lorebook_entries',
  lorebookEntrySchema,
);

export const regexScriptSchema = z.object({
  ...versioned,
  name: z.string(),
  find: z.string(),
  replace: z.string(),
  placements: z.array(z.enum(REGEX.placements)),
  display_only: z.boolean(),
  prompt_only: z.boolean(),
  min_depth: z.number().nullable(),
  max_depth: z.number().nullable(),
  enabled: z.boolean(),
  position: z.number(),
});
export type RegexScriptRecord = z.infer<typeof regexScriptSchema>;
export const regexScripts = resource<RegexScriptRecord, Fields<RegexScriptRecord> & { name: string; find: string }>(
  'regex_script',
  'regex_scripts',
  regexScriptSchema,
);

export const quickReplySchema = z.object({
  ...versioned,
  label: z.string(),
  message: z.string(),
  action: z.enum(QUICK_REPLY.actions),
  channel: z.enum(QUICK_REPLY.channels),
  enabled: z.boolean(),
  position: z.number(),
  auto_run: z.enum(QUICK_REPLY.auto_runs),
});
export type QuickReply = z.infer<typeof quickReplySchema>;
export const quickReplies = resource<QuickReply, Fields<QuickReply> & { label: string; message: string }>(
  'quick_reply',
  'quick_replies',
  quickReplySchema,
);

export const dataDocumentSchema = z.object({
  ...versioned,
  name: z.string(),
  text: z.string(),
  scope: z.enum(DATA_BANK.scopes),
  scope_id: z.string().nullable(),
});
export type DataDocument = z.infer<typeof dataDocumentSchema>;
export const dataDocuments = resource<DataDocument, Fields<DataDocument> & { name: string; text: string }>(
  'data_document',
  'data_documents',
  dataDocumentSchema,
);

export const campaignSchema = z.object({
  ...versioned,
  name: z.string(),
  premise: z.string(),
  genre: z.string(),
  dials: z.record(z.string(), z.number()),
  themes: z.array(z.string()),
  pillars: z.record(z.string(), z.number()),
  structure: z.enum(CAMPAIGN.structures).nullable(),
  truths: z.array(z.string()),
  characters: z.string(),
  resolution_mode: z.enum(CAMPAIGN.resolution_modes).nullable(),
  gm_style: z.string(),
  wiki_campaign_id: z.string().nullable(),
});
export type Campaign = z.infer<typeof campaignSchema>;
export const campaigns = resource<Campaign, Fields<Campaign> & { name: string }>('campaign_frame', 'campaign_frames', campaignSchema);

export const scenarioSchema = z.object({
  ...versioned,
  name: z.string(),
  campaign_id: z.string().nullable(),
  premise: z.string(),
  hook: z.string(),
  stakes: z.string(),
  situation: z.string(),
  cast: z.array(
    z.object({
      name: z.string(),
      agenda: z.string(),
      secret: z.string(),
      disposition: z.string(),
      /** How the NPC sounds when the GM's lines are voice-acted. */
      voice: z
        .object({
          name: z.string().nullable().optional(),
          rate: z.number().optional(),
          pitch: z.number().optional(),
          server: z.string().nullable().optional(),
        })
        .optional(),
    }),
  ),
  places: z.array(z.string()),
  clocks: z.array(
    z.object({ name: z.string(), segments: z.number(), filled: z.number(), advances: z.string(), when_full: z.string() }),
  ),
  secrets: z.array(z.object({ truth: z.string(), clues: z.array(z.object({ text: z.string(), found: z.boolean() })) })),
  beats: z.array(z.object({ text: z.string(), done: z.boolean() })),
  outcomes: z.array(z.string()),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const scenarios = resource<Scenario, Fields<Scenario> & { name: string }>('scenario', 'scenarios', scenarioSchema);

export const characterExpressionSchema = z.object({
  ...versioned,
  character_id: z.string(),
  label: z.string(),
  image: z.string(),
});
export type CharacterExpression = z.infer<typeof characterExpressionSchema>;
export const characterExpressions = resource<
  CharacterExpression,
  Fields<CharacterExpression> & { character_id: string; label: string; image: string }
>('character_expression', 'character_expressions', characterExpressionSchema);

/** A person's own instruct template (A17). */
export const instructTemplateSchema = z.object({
  ...versioned,
  name: z.string(),
  start: z.string(),
  system_prefix: z.string(),
  system_suffix: z.string(),
  user_prefix: z.string(),
  user_suffix: z.string(),
  assistant_prefix: z.string(),
  assistant_suffix: z.string(),
  stop: z.array(z.string()),
});
export type InstructTemplateRecord = z.infer<typeof instructTemplateSchema>;
export const instructTemplates = resource<InstructTemplateRecord, Fields<InstructTemplateRecord> & { name: string }>(
  'instruct_template',
  'instruct_templates',
  instructTemplateSchema,
);
