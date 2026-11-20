// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's lorebook records (SillyTavern's World Info): the same resources, fields and
 * rules as the SaaS server's ai_lorebook extension, with the limits read from contract/rpg_ai.json.
 *
 * - `lorebook`: a named book of entries. Deleting one deletes its entries, and unlinks it from the
 *   chats and characters that named it.
 * - `lorebook_entry`: one entry, the full World Info field surface (keys, secondary keys and their
 *   logic, position and depth, order, probability, inclusion group, timed effects, recursion,
 *   matching, character filter). Listed by `?lorebook_id=`.
 *
 * A chat's lore timers (sticky and cooldown) are written by generation (lib/generate.ts), not
 * through the API.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { DEPTH_ROLES, LIMITS, LORE, LORE_POSITIONS, SELECTIVE_LOGIC } from '~/contract';
import { type Columns, columnsOf, fieldsOf, jsonList, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const name = z.string().trim().min(1).max(LIMITS.name_characters);
const ranged = (key: keyof typeof LORE.ranges) => z.number().int().min(LORE.ranges[key][0]).max(LORE.ranges[key][1]);

function written(columns: Columns, input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(columns, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

// ---- lorebook -----------------------------------------------------------------------------

const BOOK_COLUMNS: Columns = { name: plain('name'), description: plain('description') };
const description = z.string().max(LIMITS.card_field_characters);
const bookCreate = z.object({ name, description: description.default('') });
const bookUpdate = z.object({ name, description }).partial();

type BookRow = Prisma.LorebookGetPayload<object>;

/** Drops `id` from every chat's `lorebook_ids` and every character's `lorebook_id` of `ownerId`. */
async function unlinkLorebook(ownerId: string, id: string, stamp: Date): Promise<void> {
  const chats = await prisma.chat.findMany({ where: { createdById: ownerId }, select: { id: true, lorebookIds: true } });
  const affected = chats.filter((chat) => (fieldsOf({ ids: jsonList('lorebookIds') }, chat).ids as string[]).includes(id));
  await prisma.$transaction([
    ...affected.map((chat) =>
      prisma.chat.update({
        where: { id: chat.id },
        data: {
          lorebookIds: JSON.stringify(
            (fieldsOf({ ids: jsonList('lorebookIds') }, chat).ids as string[]).filter((one) => one !== id),
          ),
          updatedAt: stamp,
        },
      }),
    ),
    prisma.character.updateMany({
      where: { createdById: ownerId, lorebookId: id },
      data: { lorebookId: null, updatedAt: stamp },
    }),
  ]);
}

export const lorebooks: ResourceSpec<BookRow, z.infer<typeof bookCreate>, z.infer<typeof bookUpdate>> = {
  resource: 'lorebook',
  plural: 'lorebooks',
  modelName: 'LorebookModel',
  createSchema: bookCreate,
  updateSchema: bookUpdate,
  list: (ownerId) => prisma.lorebook.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.lorebook.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) =>
    prisma.lorebook.create({
      data: { createdById: ownerId, ...written(BOOK_COLUMNS, input, stamp) } as Prisma.LorebookUncheckedCreateInput,
    }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.lorebook.updateMany({
      where: { id, updatedAt: version },
      data: written(BOOK_COLUMNS, input, stamp, userId) as Prisma.LorebookUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.lorebook.findUnique({ where: { id } });
  },
  async remove(id) {
    const book = await prisma.lorebook.findUnique({ where: { id }, select: { createdById: true } });
    if (book === null) return;
    await unlinkLorebook(book.createdById, id, new Date());
    await prisma.$transaction([
      prisma.lorebookEntry.deleteMany({ where: { lorebookId: id } }),
      prisma.lorebook.delete({ where: { id } }),
    ]);
  },
  fields: (row) => fieldsOf(BOOK_COLUMNS, row),
};

// ---- lorebook_entry -----------------------------------------------------------------------

const ENTRY_COLUMNS: Columns = {
  lorebook_id: plain('lorebookId'),
  comment: plain('comment'),
  keys: jsonList('keys'),
  secondary_keys: jsonList('secondaryKeys'),
  selective_logic: plain('selectiveLogic'),
  content: plain('content'),
  enabled: plain('enabled'),
  constant: plain('constant'),
  position: plain('position'),
  depth: plain('depth'),
  role: plain('role'),
  order: plain('order'),
  probability: plain('probability'),
  group: plain('inclusionGroup'),
  group_weight: plain('groupWeight'),
  prioritize: plain('prioritize'),
  sticky: plain('sticky'),
  cooldown: plain('cooldown'),
  delay: plain('delay'),
  exclude_recursion: plain('excludeRecursion'),
  prevent_recursion: plain('preventRecursion'),
  delay_until_recursion: plain('delayUntilRecursion'),
  case_sensitive: plain('caseSensitive'),
  match_whole_words: plain('matchWholeWords'),
  character_names: jsonList('characterNames'),
  character_exclude: plain('characterExclude'),
};

const keys = z.array(z.string().min(1).max(LIMITS.lore_key_characters)).max(LIMITS.lore_keys_per_entry);
const entryFields = {
  comment: z.string().max(LIMITS.short_text_characters),
  keys,
  secondary_keys: keys,
  selective_logic: z.enum(SELECTIVE_LOGIC),
  content: z.string().max(LIMITS.lore_content_characters),
  enabled: z.boolean(),
  constant: z.boolean(),
  position: z.enum(LORE_POSITIONS),
  depth: ranged('depth'),
  role: z.enum(DEPTH_ROLES),
  order: ranged('order'),
  probability: ranged('probability'),
  group: z.string().max(LIMITS.short_text_characters),
  group_weight: ranged('group_weight'),
  prioritize: z.boolean(),
  sticky: ranged('timed'),
  cooldown: ranged('timed'),
  delay: ranged('timed'),
  exclude_recursion: z.boolean(),
  prevent_recursion: z.boolean(),
  delay_until_recursion: z.boolean(),
  case_sensitive: z.boolean().nullable(),
  match_whole_words: z.boolean().nullable(),
  character_names: z.array(z.string().min(1).max(LIMITS.name_characters)).max(LIMITS.characters_per_chat * 4),
  character_exclude: z.boolean(),
};
const D = LORE.defaults;
const entryCreate = z.object({
  lorebook_id: z.string().min(1),
  comment: entryFields.comment.default(''),
  keys: keys.default([]),
  secondary_keys: keys.default([]),
  selective_logic: entryFields.selective_logic.default('and_any'),
  content: entryFields.content.default(''),
  enabled: z.boolean().default(true),
  constant: z.boolean().default(false),
  position: entryFields.position.default('after_char'),
  depth: entryFields.depth.default(D.depth),
  role: entryFields.role.default('system'),
  order: entryFields.order.default(D.order),
  probability: entryFields.probability.default(D.probability),
  group: entryFields.group.default(''),
  group_weight: entryFields.group_weight.default(D.group_weight),
  prioritize: z.boolean().default(false),
  sticky: entryFields.sticky.default(0),
  cooldown: entryFields.cooldown.default(0),
  delay: entryFields.delay.default(0),
  exclude_recursion: z.boolean().default(false),
  prevent_recursion: z.boolean().default(false),
  delay_until_recursion: z.boolean().default(false),
  case_sensitive: entryFields.case_sensitive.default(null),
  match_whole_words: entryFields.match_whole_words.default(null),
  character_names: entryFields.character_names.default([]),
  character_exclude: z.boolean().default(false),
});
// An entry stays in its lorebook; everything else can change.
const entryUpdate = z.object(entryFields).partial();

type EntryRow = Prisma.LorebookEntryGetPayload<object>;

export const lorebookEntries: ResourceSpec<EntryRow, z.infer<typeof entryCreate>, z.infer<typeof entryUpdate>> = {
  resource: 'lorebook_entry',
  plural: 'lorebook_entries',
  modelName: 'LorebookEntryModel',
  createSchema: entryCreate,
  updateSchema: entryUpdate,
  list(ownerId, query) {
    const lorebookId = query.get('lorebook_id');
    return prisma.lorebookEntry.findMany({
      where: { createdById: ownerId, ...(lorebookId === null ? {} : { lorebookId }) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  },
  find: (id, ownerId) => prisma.lorebookEntry.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    const book = await prisma.lorebook.count({ where: { id: input.lorebook_id, createdById: ownerId } });
    if (book === 0) throw validationError('That lorebook is not one of yours', 'lorebook_id');
    const entries = await prisma.lorebookEntry.count({ where: { lorebookId: input.lorebook_id } });
    if (entries >= LIMITS.lorebook_entries)
      throw validationError(`A lorebook has at most ${LIMITS.lorebook_entries} entries`, 'lorebook_id');
    return prisma.lorebookEntry.create({
      data: { createdById: ownerId, ...written(ENTRY_COLUMNS, input, stamp) } as Prisma.LorebookEntryUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.lorebookEntry.updateMany({
      where: { id, updatedAt: version },
      data: written(ENTRY_COLUMNS, input, stamp, userId) as Prisma.LorebookEntryUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.lorebookEntry.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.lorebookEntry.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(ENTRY_COLUMNS, row),
};
