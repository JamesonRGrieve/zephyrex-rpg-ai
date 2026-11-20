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
import { CHAT_MODES, MESSAGE_CHANNELS, MESSAGE_ROLES } from '~/contract';

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
  extensions: z.record(z.string(), z.unknown()),
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
});
export type Preset = z.infer<typeof presetSchema>;

export const endpointSchema = z.object({
  ...versioned,
  name: z.string(),
  base_url: z.string(),
  model: z.string(),
  is_default: z.boolean(),
  has_api_key: z.boolean(),
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
  useList(query?: Record<string, string>): SWRResponse<T[], Error>;
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
    useList(query) {
      const client = useClient();
      const key = listKey(query);
      return useSWR(key, () => client.list(key, plural, schema));
    },
    useOne(id) {
      const client = useClient();
      return useSWR(id === null ? null : `${path}/${id}`, async () => one(schema, singular, await client.get(`${path}/${id ?? ''}`)));
    },
    useActions() {
      const client = useClient();
      const { mutate } = useSWRConfig();
      // A change has every list of this resource, and the record itself, read again.
      const refresh = async (id?: string) => {
        await mutate((key) => typeof key === 'string' && (key === path || key.startsWith(`${path}?`) || key === `${path}/${id ?? ''}`));
      };
      return {
        async create(fields) {
          const saved = one(schema, singular, await client.post(path, { [singular]: fields }));
          await refresh(saved.id);
          return saved;
        },
        async update(seen, changes) {
          const saved = one(schema, singular, await client.put(`${path}/${seen.id}`, { [singular]: changes }, seen));
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

export const characters = resource<Character, Fields<Character> & { name: string }>('character', 'characters', characterSchema);
export const personas = resource<Persona, Fields<Persona> & { name: string }>('persona', 'personas', personaSchema);
export const chats = resource<Chat, Fields<Chat> & { title: string; character_ids: string[] }>('chat', 'chats', chatSchema);
export const messages = resource<
  ChatMessage,
  Pick<ChatMessage, 'chat_id' | 'parent_id' | 'role' | 'swipes'> & Fields<ChatMessage>
>('chat_message', 'chat_messages', messageSchema);
export const presets = resource<Preset, Fields<Preset> & { name: string }>('generation_preset', 'generation_presets', presetSchema);
export const endpoints = resource<
  ModelEndpoint,
  Fields<ModelEndpoint, { api_key?: string }> & { name: string; base_url: string; model: string },
  { api_key?: string }
>('model_endpoint', 'model_endpoints', endpointSchema);
