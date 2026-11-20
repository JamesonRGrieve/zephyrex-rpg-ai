// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's records: the same resources, fields and rules as the SaaS server's
 * extensions (server/extensions/ai_character, ai_chat), with the limits both read from
 * contract/rpg_ai.json. Each resource names its fields once (columns.ts).
 *
 * - `character`: a character card, SillyTavern Character Card V2/V3 fields.
 * - `persona`: who the person plays as; making one the default clears the others.
 * - `chat`: a conversation with characters the owner has.
 * - `chat_message`: a turn in one of the owner's chats. Its alternatives are `swipes`, the shown
 *   one `swipe_index`; `parent_id` branches the chat. Listed by `?chat_id=`, oldest first.
 * - `generation_preset`: sampler settings, inside the contract's ranges.
 * - `model_endpoint`: an OpenAI-compatible endpoint (lite generates through it). Its API key is
 *   write-only: answers say only whether one is set.
 *
 * A character may have its own lorebook (`lorebook_id`), and a chat names the lorebooks it reads
 * (`lorebook_ids`) and its World Info settings (`lore_settings`); lorebooks themselves are in
 * loreRecords.ts.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { CHAT_MODES, LIMITS, LORE, MESSAGE_CHANNELS, MESSAGE_ROLES, PRESET_DEFAULTS, SAMPLER_RANGES } from '~/contract';
import { type Columns, columnsOf, fieldsOf, jsonList, jsonObject, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

const name = z.string().trim().min(1).max(LIMITS.name_characters);
const cardText = z.string().max(LIMITS.card_field_characters);
const shortText = z.string().max(LIMITS.short_text_characters);
const tags = z.array(z.string().trim().min(1).max(LIMITS.tag_characters)).max(LIMITS.tags_per_record);
/** An avatar travels as a data URL, so the lite edition needs no file store. */
const avatar = z
  .string()
  .max(LIMITS.avatar_bytes)
  .regex(DATA_URL, 'An avatar is a PNG, JPEG, WebP or GIF data URL')
  .nullable();
const extensions = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= LIMITS.extensions_bytes, 'Extensions are too large');
const recordId = z.string().min(1).max(LIMITS.short_text_characters);

/** A write's data for Prisma: the declared columns, plus the stamp and who wrote it. */
function written(columns: Columns, input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(columns, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

// ---- character ----------------------------------------------------------------------------

const CHARACTER_COLUMNS: Columns = {
  name: plain('name'),
  description: plain('description'),
  personality: plain('personality'),
  scenario: plain('scenario'),
  first_message: plain('firstMessage'),
  alternate_greetings: jsonList('alternateGreetings'),
  example_messages: plain('exampleMessages'),
  system_prompt: plain('systemPrompt'),
  post_history_instructions: plain('postHistoryInstructions'),
  creator_notes: plain('creatorNotes'),
  creator: plain('creator'),
  character_version: plain('characterVersion'),
  tags: jsonList('tags'),
  avatar: plain('avatar'),
  favourite: plain('favourite'),
  extensions: jsonObject('extensions'),
  lorebook_id: plain('lorebookId'),
};

const characterFields = {
  description: cardText,
  personality: cardText,
  scenario: cardText,
  first_message: cardText,
  alternate_greetings: z.array(cardText).max(LIMITS.greetings_per_character),
  example_messages: cardText,
  system_prompt: cardText,
  post_history_instructions: cardText,
  creator_notes: cardText,
  creator: shortText,
  character_version: shortText,
  tags,
  avatar,
  favourite: z.boolean(),
  extensions,
  lorebook_id: z.string().min(1).nullable(),
};

const characterCreate = z.object({
  name,
  description: cardText.default(''),
  personality: cardText.default(''),
  scenario: cardText.default(''),
  first_message: cardText.default(''),
  alternate_greetings: characterFields.alternate_greetings.default([]),
  example_messages: cardText.default(''),
  system_prompt: cardText.default(''),
  post_history_instructions: cardText.default(''),
  creator_notes: cardText.default(''),
  creator: shortText.default(''),
  character_version: shortText.default(''),
  tags: tags.default([]),
  avatar: avatar.default(null),
  favourite: z.boolean().default(false),
  extensions: extensions.default({}),
  lorebook_id: z.string().min(1).nullable().default(null),
});
const characterUpdate = z.object({ name, ...characterFields }).partial();

type CharacterRow = Prisma.CharacterGetPayload<object>;

/** A character's own lorebook must be one of the owner's. */
async function checkCharacterLorebook(ownerId: string, lorebookId: string | null | undefined): Promise<void> {
  if (typeof lorebookId !== 'string') return;
  const found = await prisma.lorebook.count({ where: { createdById: ownerId, id: lorebookId } });
  if (found === 0) throw validationError('That lorebook is not one of yours', 'lorebook_id');
}

export const characters: ResourceSpec<CharacterRow, z.infer<typeof characterCreate>, z.infer<typeof characterUpdate>> = {
  resource: 'character',
  plural: 'characters',
  modelName: 'CharacterModel',
  createSchema: characterCreate,
  updateSchema: characterUpdate,
  list: (ownerId) =>
    prisma.character.findMany({ where: { createdById: ownerId }, orderBy: [{ favourite: 'desc' }, { name: 'asc' }] }),
  find: (id, ownerId) => prisma.character.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkCharacterLorebook(ownerId, input.lorebook_id);
    return prisma.character.create({
      data: { createdById: ownerId, ...written(CHARACTER_COLUMNS, input, stamp) } as Prisma.CharacterUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const current = await prisma.character.findUnique({ where: { id }, select: { createdById: true } });
    if (current !== null) await checkCharacterLorebook(current.createdById, input.lorebook_id);
    const { count } = await prisma.character.updateMany({
      where: { id, updatedAt: version },
      data: written(CHARACTER_COLUMNS, input, stamp, userId) as Prisma.CharacterUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.character.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.character.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(CHARACTER_COLUMNS, row),
};

// ---- persona ------------------------------------------------------------------------------

const PERSONA_COLUMNS: Columns = {
  name: plain('name'),
  description: plain('description'),
  avatar: plain('avatar'),
  is_default: plain('isDefault'),
};

const personaDescription = z.string().max(LIMITS.persona_description_characters);
const personaCreate = z.object({
  name,
  description: personaDescription.default(''),
  avatar: avatar.default(null),
  is_default: z.boolean().default(false),
});
const personaUpdate = z.object({ name, description: personaDescription, avatar, is_default: z.boolean() }).partial();

/** Only one persona is the default: making one so clears the flag on the others. */
async function clearOtherDefaults(ownerId: string, keepId: string | null, stamp: Date): Promise<void> {
  await prisma.persona.updateMany({
    where: { createdById: ownerId, isDefault: true, ...(keepId === null ? {} : { NOT: { id: keepId } }) },
    data: { isDefault: false, updatedAt: stamp },
  });
}

type PersonaRow = Prisma.PersonaGetPayload<object>;

export const personas: ResourceSpec<PersonaRow, z.infer<typeof personaCreate>, z.infer<typeof personaUpdate>> = {
  resource: 'persona',
  plural: 'personas',
  modelName: 'PersonaModel',
  createSchema: personaCreate,
  updateSchema: personaUpdate,
  list: (ownerId) => prisma.persona.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.persona.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    if (input.is_default) await clearOtherDefaults(ownerId, null, stamp);
    return prisma.persona.create({
      data: { createdById: ownerId, ...written(PERSONA_COLUMNS, input, stamp) } as Prisma.PersonaUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.persona.updateMany({
      where: { id, updatedAt: version },
      data: written(PERSONA_COLUMNS, input, stamp, userId) as Prisma.PersonaUncheckedUpdateManyInput,
    });
    if (count === 0) return null;
    const updated = await prisma.persona.findUnique({ where: { id } });
    if (updated !== null && input.is_default === true) await clearOtherDefaults(updated.createdById, id, stamp);
    return updated;
  },
  async remove(id) {
    await prisma.persona.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(PERSONA_COLUMNS, row),
};

// ---- chat ---------------------------------------------------------------------------------

const CHAT_COLUMNS: Columns = {
  title: plain('title'),
  mode: plain('mode'),
  character_ids: jsonList('characterIds'),
  persona_id: plain('personaId'),
  preset_id: plain('presetId'),
  endpoint_id: plain('endpointId'),
  author_note: plain('authorNote'),
  lorebook_ids: jsonList('lorebookIds'),
  lore_settings: jsonObject('loreSettings'),
};

const title = z.string().trim().min(1).max(LIMITS.chat_title_characters);
const characterIds = z
  .array(recordId)
  .min(1)
  .max(LIMITS.characters_per_chat)
  .refine((ids) => new Set(ids).size === ids.length, 'A character is in a chat once');
const loreRange = (key: keyof typeof LORE.ranges) => z.number().int().min(LORE.ranges[key][0]).max(LORE.ranges[key][1]);
/** A chat's World Info settings; what it leaves out takes the contract's defaults. */
export const loreSettings = z
  .object({
    scan_depth: loreRange('scan_depth'),
    token_budget: loreRange('token_budget'),
    recursion_steps: loreRange('recursion_steps'),
    case_sensitive: z.boolean(),
    match_whole_words: z.boolean(),
  })
  .partial()
  .strict();

const chatFields = {
  mode: z.enum(CHAT_MODES),
  character_ids: characterIds,
  persona_id: recordId.nullable(),
  preset_id: recordId.nullable(),
  endpoint_id: recordId.nullable(),
  author_note: z.string().max(LIMITS.author_note_characters),
  lorebook_ids: z
    .array(recordId)
    .max(LIMITS.lorebooks_per_chat)
    .refine((ids) => new Set(ids).size === ids.length, 'A lorebook is in a chat once'),
  lore_settings: loreSettings,
};
const chatCreate = z.object({
  title,
  mode: chatFields.mode.default('character'),
  character_ids: characterIds,
  persona_id: chatFields.persona_id.default(null),
  preset_id: chatFields.preset_id.default(null),
  endpoint_id: chatFields.endpoint_id.default(null),
  author_note: chatFields.author_note.default(''),
  lorebook_ids: chatFields.lorebook_ids.default([]),
  lore_settings: loreSettings.default({}),
});
const chatUpdate = z.object({ title, ...chatFields }).partial();

/** Every record a chat names must be one of the owner's own. */
async function checkChatReferences(ownerId: string, input: z.infer<typeof chatUpdate>): Promise<void> {
  const owned = { createdById: ownerId };
  if (input.character_ids !== undefined) {
    const found = await prisma.character.count({ where: { ...owned, id: { in: input.character_ids } } });
    if (found !== input.character_ids.length) throw validationError('Every character must be one of yours', 'character_ids');
  }
  if (input.lorebook_ids !== undefined && input.lorebook_ids.length > 0) {
    const found = await prisma.lorebook.count({ where: { ...owned, id: { in: input.lorebook_ids } } });
    if (found !== input.lorebook_ids.length) throw validationError('Every lorebook must be one of yours', 'lorebook_ids');
  }
  const single: [keyof typeof input, () => Promise<number>][] = [
    ['persona_id', () => prisma.persona.count({ where: { ...owned, id: input.persona_id ?? '' } })],
    ['preset_id', () => prisma.generationPreset.count({ where: { ...owned, id: input.preset_id ?? '' } })],
    ['endpoint_id', () => prisma.modelEndpoint.count({ where: { ...owned, id: input.endpoint_id ?? '' } })],
  ];
  const named = single.filter(([field]) => typeof input[field] === 'string');
  const counts = await Promise.all(named.map(([, count]) => count()));
  const missing = named.find((_, index) => counts[index] === 0);
  if (missing !== undefined) throw validationError('That record is not one of yours', missing[0]);
}

type ChatRow = Prisma.ChatGetPayload<object>;

export const chats: ResourceSpec<ChatRow, z.infer<typeof chatCreate>, z.infer<typeof chatUpdate>> = {
  resource: 'chat',
  plural: 'chats',
  modelName: 'ChatModel',
  createSchema: chatCreate,
  updateSchema: chatUpdate,
  list: (ownerId) => prisma.chat.findMany({ where: { createdById: ownerId }, orderBy: { updatedAt: 'desc' } }),
  find: (id, ownerId) => prisma.chat.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkChatReferences(ownerId, input);
    return prisma.chat.create({
      data: { createdById: ownerId, ...written(CHAT_COLUMNS, input, stamp) } as Prisma.ChatUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    await checkChatReferences(userId, input);
    const { count } = await prisma.chat.updateMany({
      where: { id, updatedAt: version },
      data: written(CHAT_COLUMNS, input, stamp, userId) as Prisma.ChatUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.chat.findUnique({ where: { id } });
  },
  async remove(id) {
    // A chat's messages go with it.
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { chatId: id } }),
      prisma.chatLoreState.deleteMany({ where: { chatId: id } }),
      prisma.chat.delete({ where: { id } }),
    ]);
  },
  fields: (row) => fieldsOf(CHAT_COLUMNS, row),
};

// ---- chat_message -------------------------------------------------------------------------

const MESSAGE_COLUMNS: Columns = {
  chat_id: plain('chatId'),
  parent_id: plain('parentId'),
  role: plain('role'),
  channel: plain('channel'),
  speaker_character_id: plain('speakerCharacterId'),
  swipes: jsonList('swipes'),
  swipe_index: plain('swipeIndex'),
  bookmarked: plain('bookmarked'),
};

const swipes = z.array(z.string().max(LIMITS.message_characters)).min(1).max(LIMITS.swipes_per_message);
const messageCreate = z
  .object({
    chat_id: recordId,
    parent_id: recordId.nullable().default(null),
    role: z.enum(MESSAGE_ROLES),
    channel: z.enum(MESSAGE_CHANNELS).default('ic'),
    speaker_character_id: recordId.nullable().default(null),
    swipes,
    swipe_index: z.number().int().min(0).default(0),
    bookmarked: z.boolean().default(false),
  })
  .refine((message) => message.swipe_index < message.swipes.length, {
    message: 'swipe_index must name one of the swipes',
    path: ['swipe_index'],
  });
// A message stays in its chat and keeps its place in the tree; what it says, and which
// alternative shows, can change.
const messageUpdate = z
  .object({
    channel: z.enum(MESSAGE_CHANNELS),
    swipes,
    swipe_index: z.number().int().min(0),
    bookmarked: z.boolean(),
  })
  .partial();

type MessageCreate = z.infer<typeof messageCreate>;
type MessageUpdate = z.infer<typeof messageUpdate>;

async function checkMessageReferences(ownerId: string, input: MessageCreate): Promise<void> {
  const chat = await prisma.chat.findFirst({ where: { id: input.chat_id, createdById: ownerId } });
  if (chat === null) throw validationError('That chat is not one of yours', 'chat_id');
  if (input.parent_id !== null) {
    const parent = await prisma.chatMessage.count({ where: { id: input.parent_id, chatId: chat.id } });
    if (parent === 0) throw validationError('The parent must be a message in the same chat', 'parent_id');
  }
  if (input.speaker_character_id !== null) {
    const inChat = (fieldsOf(CHAT_COLUMNS, chat).character_ids as string[]).includes(input.speaker_character_id);
    if (!inChat) throw validationError('The speaker must be a character in the chat', 'speaker_character_id');
  }
}

/** The swipe shown must exist once the update is applied. */
function checkSwipeIndex(row: ChatMessageRow, input: MessageUpdate): void {
  const count = input.swipes?.length ?? (fieldsOf(MESSAGE_COLUMNS, row).swipes as unknown[]).length;
  const index = input.swipe_index ?? row.swipeIndex;
  if (index >= count) throw validationError('swipe_index must name one of the swipes', 'swipe_index');
}

type ChatMessageRow = Prisma.ChatMessageGetPayload<object>;

export const chatMessages: ResourceSpec<ChatMessageRow, MessageCreate, MessageUpdate> = {
  resource: 'chat_message',
  plural: 'chat_messages',
  modelName: 'ChatMessageModel',
  createSchema: messageCreate,
  updateSchema: messageUpdate,
  list(ownerId, query) {
    const chatId = query.get('chat_id');
    return prisma.chatMessage.findMany({
      where: { createdById: ownerId, ...(chatId === null ? {} : { chatId }) },
      orderBy: { createdAt: 'asc' },
    });
  },
  find: (id, ownerId) => prisma.chatMessage.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkMessageReferences(ownerId, input);
    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { createdById: ownerId, ...written(MESSAGE_COLUMNS, input, stamp) } as Prisma.ChatMessageUncheckedCreateInput,
      }),
      // A new turn brings its chat to the top of the list.
      prisma.chat.update({ where: { id: input.chat_id }, data: { updatedAt: stamp } }),
    ]);
    return message;
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const current = await prisma.chatMessage.findUnique({ where: { id } });
    if (current === null) return null;
    checkSwipeIndex(current, input);
    const { count } = await prisma.chatMessage.updateMany({
      where: { id, updatedAt: version },
      data: written(MESSAGE_COLUMNS, input, stamp, userId) as Prisma.ChatMessageUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.chatMessage.findUnique({ where: { id } });
  },
  async remove(id) {
    // A message's replies have nothing to answer once it is gone: its whole branch goes with it.
    const message = await prisma.chatMessage.findUnique({ where: { id }, select: { chatId: true } });
    if (message === null) return;
    const doomed = new Set([id]);
    const all = await prisma.chatMessage.findMany({ where: { chatId: message.chatId }, select: { id: true, parentId: true } });
    const grow = (): void => {
      const before = doomed.size;
      for (const message of all) if (message.parentId !== null && doomed.has(message.parentId)) doomed.add(message.id);
      if (doomed.size > before) grow();
    };
    grow();
    await prisma.chatMessage.deleteMany({ where: { id: { in: [...doomed] } } });
  },
  fields: (row) => fieldsOf(MESSAGE_COLUMNS, row),
};

// ---- generation_preset --------------------------------------------------------------------

const PRESET_COLUMNS: Columns = {
  name: plain('name'),
  temperature: plain('temperature'),
  top_p: plain('topP'),
  top_k: plain('topK'),
  repetition_penalty: plain('repetitionPenalty'),
  max_tokens: plain('maxTokens'),
  context_tokens: plain('contextTokens'),
  stop: jsonList('stop'),
};

const ranged = (setting: keyof typeof SAMPLER_RANGES) => z.number().min(SAMPLER_RANGES[setting][0]).max(SAMPLER_RANGES[setting][1]);
const wholeRanged = (setting: keyof typeof SAMPLER_RANGES) => ranged(setting).int();
const stop = z.array(z.string().min(1).max(LIMITS.stop_string_characters)).max(LIMITS.preset_stop_strings);
const presetFields = {
  temperature: ranged('temperature'),
  top_p: ranged('top_p'),
  top_k: wholeRanged('top_k'),
  repetition_penalty: ranged('repetition_penalty'),
  max_tokens: wholeRanged('max_tokens'),
  context_tokens: wholeRanged('context_tokens'),
  stop,
};
const presetCreate = z.object({
  name,
  temperature: presetFields.temperature.default(PRESET_DEFAULTS.temperature),
  top_p: presetFields.top_p.default(PRESET_DEFAULTS.top_p),
  top_k: presetFields.top_k.default(PRESET_DEFAULTS.top_k),
  repetition_penalty: presetFields.repetition_penalty.default(PRESET_DEFAULTS.repetition_penalty),
  max_tokens: presetFields.max_tokens.default(PRESET_DEFAULTS.max_tokens),
  context_tokens: presetFields.context_tokens.default(PRESET_DEFAULTS.context_tokens),
  stop: stop.default([]),
});
const presetUpdate = z.object({ name, ...presetFields }).partial();

type PresetRow = Prisma.GenerationPresetGetPayload<object>;

export const presets: ResourceSpec<PresetRow, z.infer<typeof presetCreate>, z.infer<typeof presetUpdate>> = {
  resource: 'generation_preset',
  plural: 'generation_presets',
  modelName: 'GenerationPresetModel',
  createSchema: presetCreate,
  updateSchema: presetUpdate,
  list: (ownerId) => prisma.generationPreset.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.generationPreset.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) =>
    prisma.generationPreset.create({
      data: { createdById: ownerId, ...written(PRESET_COLUMNS, input, stamp) } as Prisma.GenerationPresetUncheckedCreateInput,
    }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.generationPreset.updateMany({
      where: { id, updatedAt: version },
      data: written(PRESET_COLUMNS, input, stamp, userId) as Prisma.GenerationPresetUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.generationPreset.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.generationPreset.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(PRESET_COLUMNS, row),
};

// ---- model_endpoint -----------------------------------------------------------------------

const ENDPOINT_COLUMNS: Columns = {
  name: plain('name'),
  base_url: plain('baseUrl'),
  model: plain('model'),
  is_default: plain('isDefault'),
};

const baseUrl = z
  .string()
  .max(LIMITS.endpoint_url_characters)
  .url()
  .refine((url) => /^https?:\/\//.test(url), 'An endpoint is an http or https URL');
const endpointFields = {
  base_url: baseUrl,
  model: z.string().trim().min(1).max(LIMITS.model_name_characters),
  /** Write-only; an empty string clears it. */
  api_key: z.string().max(LIMITS.api_key_characters),
  is_default: z.boolean(),
};
const endpointCreate = z.object({
  name,
  base_url: baseUrl,
  model: endpointFields.model,
  api_key: endpointFields.api_key.default(''),
  is_default: z.boolean().default(false),
});
const endpointUpdate = z.object({ name, ...endpointFields }).partial();

type EndpointRow = Prisma.ModelEndpointGetPayload<object>;

function endpointData(input: z.infer<typeof endpointUpdate>, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...written(ENDPOINT_COLUMNS, input, stamp, userId), ...(input.api_key === undefined ? {} : { apiKey: input.api_key }) };
}

async function clearOtherDefaultEndpoints(ownerId: string, keepId: string | null, stamp: Date): Promise<void> {
  await prisma.modelEndpoint.updateMany({
    where: { createdById: ownerId, isDefault: true, ...(keepId === null ? {} : { NOT: { id: keepId } }) },
    data: { isDefault: false, updatedAt: stamp },
  });
}

export const endpoints: ResourceSpec<EndpointRow, z.infer<typeof endpointCreate>, z.infer<typeof endpointUpdate>> = {
  resource: 'model_endpoint',
  plural: 'model_endpoints',
  modelName: 'ModelEndpointModel',
  createSchema: endpointCreate,
  updateSchema: endpointUpdate,
  list: (ownerId) => prisma.modelEndpoint.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.modelEndpoint.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    if (input.is_default) await clearOtherDefaultEndpoints(ownerId, null, stamp);
    return prisma.modelEndpoint.create({
      data: { createdById: ownerId, ...endpointData(input, stamp) } as Prisma.ModelEndpointUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.modelEndpoint.updateMany({
      where: { id, updatedAt: version },
      data: endpointData(input, stamp, userId) as Prisma.ModelEndpointUncheckedUpdateManyInput,
    });
    if (count === 0) return null;
    const updated = await prisma.modelEndpoint.findUnique({ where: { id } });
    if (updated !== null && input.is_default === true) await clearOtherDefaultEndpoints(updated.createdById, id, stamp);
    return updated;
  },
  async remove(id) {
    await prisma.modelEndpoint.delete({ where: { id } });
  },
  fields: (row) => ({ ...fieldsOf(ENDPOINT_COLUMNS, row), has_api_key: row.apiKey !== '' }),
};
