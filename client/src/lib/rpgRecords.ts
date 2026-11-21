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
import { ownTemplate } from '~/lib/instructTemplateRecords';
import { z } from 'zod';
import {
  CHAT_MODES,
  LIMITS,
  LORE,
  MESSAGE_CHANNELS,
  MESSAGE_ROLES,
  PERSONA,
  PICTURE,
  PRESET_DEFAULTS,
  PROMPT,
  SAFETY,
  CHAT_SEATS,
  SAMPLER_EXTRAS,
  SAMPLER_RANGES,
  TABLE,
  ENDPOINT_KINDS,
  isSearchApi,
  ENDPOINT_ROLES,
  INSTRUCT_TEMPLATES,
  type InstructTemplateId,
} from '~/contract';
import { samplerProblem } from '~/features/prompt/samplers';
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
  folder: plain('folder'),
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
  folder: z.string().trim().max(LIMITS.name_characters),
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
  folder: characterFields.folder.default(''),
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
  title: plain('title'),
  description_position: plain('descriptionPosition'),
  description_depth: plain('descriptionDepth'),
  description_role: plain('descriptionRole'),
  lorebook_id: plain('lorebookId'),
  character_ids: jsonList('characterIds'),
};

const personaDescription = z.string().max(LIMITS.persona_description_characters);
// Audit gap 9: a title, where the description goes, its own lorebook, and characters it's locked to.
const personaExtras = {
  title: z.string().trim().max(PERSONA.title_characters),
  description_position: z.enum(PERSONA.positions),
  description_depth: z.number().int().min(0).max(PERSONA.depth_max),
  description_role: z.enum(PERSONA.roles),
  lorebook_id: z.string().min(1).nullable(),
  character_ids: z
    .array(z.string().min(1))
    .max(PERSONA.locked_characters)
    .refine((ids) => new Set(ids).size === ids.length, 'Each character once'),
};
const personaCreate = z.object({
  name,
  description: personaDescription.default(''),
  avatar: avatar.default(null),
  is_default: z.boolean().default(false),
  title: personaExtras.title.default(''),
  description_position: personaExtras.description_position.default('prompt'),
  description_depth: personaExtras.description_depth.default(PERSONA.default_depth),
  description_role: personaExtras.description_role.default('system'),
  lorebook_id: personaExtras.lorebook_id.default(null),
  character_ids: personaExtras.character_ids.default([]),
});
const personaUpdate = z
  .object({ name, description: personaDescription, avatar, is_default: z.boolean(), ...personaExtras })
  .partial();

/** A persona's lorebook and locked characters must be the owner's own (audit gap 9). */
async function checkPersonaReferences(ownerId: string, input: z.infer<typeof personaUpdate>): Promise<void> {
  const owned = { createdById: ownerId };
  if (input.lorebook_id != null && (await prisma.lorebook.count({ where: { ...owned, id: input.lorebook_id } })) === 0)
    throw validationError('The lorebook must be one of yours', 'lorebook_id');
  if (input.character_ids !== undefined && input.character_ids.length > 0) {
    const found = await prisma.character.count({ where: { ...owned, id: { in: input.character_ids } } });
    if (found !== input.character_ids.length) throw validationError('Every character must be one of yours', 'character_ids');
  }
}

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
  plural: 'personae', // the framework's classical plural
  modelName: 'PersonaModel',
  createSchema: personaCreate,
  updateSchema: personaUpdate,
  list: (ownerId) => prisma.persona.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.persona.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkPersonaReferences(ownerId, input);
    if (input.is_default) await clearOtherDefaults(ownerId, null, stamp);
    return prisma.persona.create({
      data: { createdById: ownerId, ...written(PERSONA_COLUMNS, input, stamp) } as Prisma.PersonaUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const current = await prisma.persona.findUnique({ where: { id } });
    if (current !== null) await checkPersonaReferences(current.createdById, input);
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
  system_prompt: plain('systemPrompt'),
  summary: plain('summary'),
  tags: jsonList('tags'),
  folder: plain('folder'),
  muted_ids: jsonList('mutedIds'),
  background: plain('background'),
  objectives: jsonList('objectives'),
  content_rating: plain('contentRating'),
  seat: plain('seat'),
  lines: jsonList('lines'),
  veils: jsonList('veils'),
  table_notes: jsonList('tableNotes'),
  paused: plain('paused'),
  variables: jsonObject('variables'),
  campaign_id: plain('campaignId'),
  scenario_id: plain('scenarioId'),
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
  system_prompt: z.string().max(LIMITS.chat_system_prompt_characters),
  summary: z.string().max(LIMITS.chat_summary_characters),
  tags: z.array(z.string().trim().min(1).max(LIMITS.tag_characters)).max(LIMITS.tags_per_record),
  folder: z.string().trim().max(LIMITS.name_characters),
  /** Group members left out of the turn order (A52); each one of the chat's characters. */
  muted_ids: z.array(recordId).max(LIMITS.characters_per_chat),
  /** A picture behind the chat (A31), a data URL as an avatar is. */
  background: avatar,
  /** The chat's tasks, in order (A53); the first not done is put to the model. */
  objectives: z
    .array(z.object({ text: z.string().trim().min(1).max(LIMITS.short_text_characters), done: z.boolean() }).strict())
    .max(LIMITS.objectives_per_chat),
  /** The table's safety tools (A25): a content rating, lines (never) and veils (off-screen only). */
  content_rating: z.enum(SAFETY.ratings).nullable(),
  seat: z.enum(CHAT_SEATS).nullable(),
  lines: z.array(z.string().trim().min(1).max(LIMITS.short_text_characters)).max(LIMITS.safety_items),
  veils: z.array(z.string().trim().min(1).max(LIMITS.short_text_characters)).max(LIMITS.safety_items),
  /** The table's notes (A11): house rules, pacing, tone and reminders, read every turn. */
  table_notes: z
    .array(
      z
        .object({ kind: z.enum(TABLE.note_kinds), text: z.string().trim().min(1).max(LIMITS.short_text_characters) })
        .strict(),
    )
    .max(LIMITS.table_notes),
  /** Paused (A25): no story turns until the table resumes; the table GM still answers. */
  paused: z.boolean(),
  /** The chat's macro and STscript variables (audit gap 1): names to text. */
  variables: z
    .record(z.string().min(1).max(LIMITS.name_characters), z.string().max(LIMITS.variable_value_characters))
    .refine((values) => Object.keys(values).length <= LIMITS.chat_variables, 'Too many variables'),
  /** The campaign it belongs to (A57); its frame is read every turn. */
  campaign_id: recordId.nullable(),
  /** The scenario it runs (A59, A60); the GM's view of it is read every turn. */
  scenario_id: recordId.nullable(),
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
  system_prompt: chatFields.system_prompt.default(''),
  summary: chatFields.summary.default(''),
  tags: chatFields.tags.default([]),
  folder: chatFields.folder.default(''),
  muted_ids: chatFields.muted_ids.default([]),
  background: avatar.default(null),
  objectives: chatFields.objectives.default([]),
  content_rating: chatFields.content_rating.default(null),
  seat: chatFields.seat.default(null),
  lines: chatFields.lines.default([]),
  veils: chatFields.veils.default([]),
  table_notes: chatFields.table_notes.default([]),
  paused: chatFields.paused.default(false),
  variables: chatFields.variables.default({}),
  campaign_id: chatFields.campaign_id.default(null),
  scenario_id: chatFields.scenario_id.default(null),
});
const chatUpdate = z.object({ title, ...chatFields }).partial();

/** Every record a chat names must be one of the owner's own. */
async function checkChatReferences(ownerId: string, input: z.infer<typeof chatUpdate>): Promise<void> {
  const owned = { createdById: ownerId };
  if (input.character_ids !== undefined) {
    const found = await prisma.character.count({ where: { ...owned, id: { in: input.character_ids } } });
    if (found !== input.character_ids.length) throw validationError('Every character must be one of yours', 'character_ids');
  }
  if (input.muted_ids !== undefined && input.muted_ids.length > 0) {
    const found = await prisma.character.count({ where: { ...owned, id: { in: input.muted_ids } } });
    if (found !== new Set(input.muted_ids).size)
      throw validationError('Every muted member must be one of your characters', 'muted_ids');
  }
  if (input.lorebook_ids !== undefined && input.lorebook_ids.length > 0) {
    const found = await prisma.lorebook.count({ where: { ...owned, id: { in: input.lorebook_ids } } });
    if (found !== input.lorebook_ids.length) throw validationError('Every lorebook must be one of yours', 'lorebook_ids');
  }
  const single: [keyof typeof input, () => Promise<number>][] = [
    ['persona_id', () => prisma.persona.count({ where: { ...owned, id: input.persona_id ?? '' } })],
    ['preset_id', () => prisma.generationPreset.count({ where: { ...owned, id: input.preset_id ?? '' } })],
    ['endpoint_id', () => prisma.modelEndpoint.count({ where: { ...owned, id: input.endpoint_id ?? '' } })],
    ['campaign_id', () => prisma.campaignFrame.count({ where: { ...owned, id: input.campaign_id ?? '' } })],
    ['scenario_id', () => prisma.scenario.count({ where: { ...owned, id: input.scenario_id ?? '' } })],
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
    // A chat's messages, lore timers and memories (A19) go with it.
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { chatId: id } }),
      prisma.chatLoreState.deleteMany({ where: { chatId: id } }),
      prisma.chatMemory.deleteMany({ where: { chatId: id } }),
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
  images: jsonList('images'),
  x_carded: plain('xCarded'),
  hidden: plain('hidden'),
};

/** Pictures sent with a line (A44), data URLs as avatars are. */
const images = z.array(avatar.unwrap()).max(LIMITS.images_per_message);
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
    images: images.default([]),
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
    /** The X-card (A25): kept in the chat, never read by the model. */
    x_carded: z.boolean(),
    /** Hidden by the person (/hide, audit gap 10): kept on screen, never read by the model. */
    hidden: z.boolean(),
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
    const all = await prisma.chatMessage.findMany({
      where: { chatId: message.chatId },
      select: { id: true, parentId: true },
    });
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
  prompt_layout: jsonList('promptLayout'),
  logit_bias: jsonObject('logitBias'),
  negative_prompt: plain('negativePrompt'),
  guidance_scale: plain('guidanceScale'),
  samplers: jsonObject('samplers'),
};

const ranged = (setting: keyof typeof SAMPLER_RANGES) =>
  z.number().min(SAMPLER_RANGES[setting][0]).max(SAMPLER_RANGES[setting][1]);
const wholeRanged = (setting: keyof typeof SAMPLER_RANGES) => ranged(setting).int();
const stop = z.array(z.string().min(1).max(LIMITS.stop_string_characters)).max(LIMITS.preset_stop_strings);
/** The prompt manager's layout (A16): each section at most once, in the order given. */
const sectionBudget = z.number().int().min(PROMPT.section_token_range[0]).max(PROMPT.section_token_range[1]).nullable();
/** The prompt manager's layout (A16): its sections, the person's own prompts and "start reply with" (audit gap 3). */
export const promptLayout = z
  .array(
    z.union([
      z.object({ id: z.enum(PROMPT.sections), enabled: z.boolean(), max_tokens: sectionBudget }).strict(),
      z
        .object({
          id: z.string().regex(/^custom:[\w-]{1,60}$/),
          name: z.string().max(LIMITS.name_characters),
          content: z.string().max(LIMITS.card_field_characters),
          role: z.enum(['system', 'user', 'assistant']),
          position: z.enum(['system', 'depth']),
          depth: z.number().int().min(0).max(PROMPT.own_prompt_depth),
          enabled: z.boolean(),
          max_tokens: sectionBudget,
        })
        .strict(),
      z
        .object({ id: z.literal('prefill'), content: z.string().max(LIMITS.card_field_characters), enabled: z.boolean() })
        .strict(),
    ]),
  )
  .max(PROMPT.sections.length + PROMPT.own_prompts + 1)
  .refine((entries) => new Set(entries.map((entry) => entry.id)).size === entries.length, 'An entry is in the layout once')
  .refine(
    (entries) => entries.filter((entry) => entry.id.startsWith('custom:')).length <= PROMPT.own_prompts,
    `At most ${PROMPT.own_prompts} prompts of your own`,
  );
const presetFields = {
  temperature: ranged('temperature'),
  top_p: ranged('top_p'),
  top_k: wholeRanged('top_k'),
  repetition_penalty: ranged('repetition_penalty'),
  max_tokens: wholeRanged('max_tokens'),
  context_tokens: wholeRanged('context_tokens'),
  stop,
  prompt_layout: promptLayout,
  /** Token id → bias (A47), sent to a chat API that takes it. */
  logit_bias: z
    .record(
      z.string().regex(/^\d+$/, 'A token id is a whole number'),
      z
        .number()
        .min(SAMPLER_EXTRAS.logit_bias_range[0] as number)
        .max(SAMPLER_EXTRAS.logit_bias_range[1] as number),
    )
    .refine(
      (bias) => Object.keys(bias).length <= SAMPLER_EXTRAS.logit_bias_entries,
      `At most ${SAMPLER_EXTRAS.logit_bias_entries} biased tokens`,
    ),
  /** Classifier-free guidance (A47): what to steer away from, and how hard, for servers that take it. */
  negative_prompt: z.string().max(LIMITS.card_field_characters),
  guidance_scale: z
    .number()
    .min(SAMPLER_EXTRAS.guidance_scale_range[0] as number)
    .max(SAMPLER_EXTRAS.guidance_scale_range[1] as number)
    .nullable(),
  /** SillyTavern's further samplers (audit gap 2): only the ones set, each in its contract range. */
  samplers: z.record(z.string(), z.union([z.number(), z.array(z.string())])).superRefine((values, context) => {
    const problem = samplerProblem(values);
    if (problem !== null) context.addIssue({ code: 'custom', message: problem });
  }),
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
  prompt_layout: promptLayout.default([]),
  logit_bias: presetFields.logit_bias.default({}),
  negative_prompt: presetFields.negative_prompt.default(''),
  guidance_scale: presetFields.guidance_scale.default(null),
  samplers: presetFields.samplers.default({}),
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
      data: {
        createdById: ownerId,
        ...written(PRESET_COLUMNS, input, stamp),
      } as Prisma.GenerationPresetUncheckedCreateInput,
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
  api: plain('api'),
  instruct_template: plain('instructTemplate'),
  custom_template_id: plain('customTemplateId'),
  image_size: plain('imageSize'),
  roles: jsonList('roles'),
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
  /**
   * `chat` (chat completions), `text` (one prompt string, in the instruct template's markup),
   * `horde`, or a web search source (A42: `searxng`, `brave`) serving only the search role.
   */
  api: z.enum(ENDPOINT_KINDS),
  instruct_template: z.enum(Object.keys(INSTRUCT_TEMPLATES) as [InstructTemplateId, ...InstructTemplateId[]]),
  /** The person's own template (A17), used in place of instruct_template; theirs only. */
  custom_template_id: z.string().min(1).nullable(),
  /** The size it is asked to draw at (A30); empty for the contract's default. */
  image_size: z.union([z.literal(''), z.enum(PICTURE.sizes as [string, ...string[]])]),
  /** What it is used for (A27); none means only where a chat names it or it is the default. */
  roles: z.array(z.enum(ENDPOINT_ROLES)).refine((roles) => new Set(roles).size === roles.length, 'Each role once'),
};
const endpointCreate = z.object({
  name,
  base_url: baseUrl,
  model: endpointFields.model,
  api_key: endpointFields.api_key.default(''),
  is_default: z.boolean().default(false),
  api: endpointFields.api.default('chat'),
  instruct_template: endpointFields.instruct_template.default('chatml'),
  custom_template_id: endpointFields.custom_template_id.default(null),
  image_size: endpointFields.image_size.default(''),
  roles: endpointFields.roles.default([]),
});
const endpointUpdate = z.object({ name, ...endpointFields }).partial();

/** A search source serves search alone, and only a search source serves search (A42). */
export function searchRoleProblem(api: string, roles: readonly string[]): string | null {
  if (isSearchApi(api))
    return roles.length === 1 && roles[0] === 'search' ? null : 'A search source serves only the search role';
  return roles.includes('search') ? 'Only a search source (searxng, brave) serves the search role' : null;
}

type EndpointRow = Prisma.ModelEndpointGetPayload<object>;

function endpointData(input: z.infer<typeof endpointUpdate>, stamp: Date, userId?: string): Record<string, unknown> {
  return {
    ...written(ENDPOINT_COLUMNS, input, stamp, userId),
    ...(input.api_key === undefined ? {} : { apiKey: input.api_key }),
  };
}

/** A custom template (A17) must be one of the owner's own (BLL_AI_Chat _check_custom_template). */
async function checkOwnTemplate(ownerId: string, templateId: string | null | undefined): Promise<void> {
  if (templateId === null || templateId === undefined) return;
  if ((await ownTemplate(ownerId, templateId)) === null) {
    throw validationError('Not one of your instruct templates', 'custom_template_id');
  }
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
    await checkOwnTemplate(ownerId, input.custom_template_id);
    const searchProblem = searchRoleProblem(input.api, input.roles);
    if (searchProblem !== null) throw validationError(searchProblem, 'roles');
    if (input.is_default) await clearOtherDefaultEndpoints(ownerId, null, stamp);
    return prisma.modelEndpoint.create({
      data: { createdById: ownerId, ...endpointData(input, stamp) } as Prisma.ModelEndpointUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const owner = await prisma.modelEndpoint.findUnique({
      where: { id },
      select: { createdById: true, api: true, roles: true },
    });
    if (owner !== null) await checkOwnTemplate(owner.createdById, input.custom_template_id);
    if (owner !== null) {
      const roles = input.roles ?? (JSON.parse(owner.roles) as string[]);
      const searchProblem = searchRoleProblem(input.api ?? owner.api, roles);
      if (searchProblem !== null) throw validationError(searchProblem, 'roles');
    }
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
