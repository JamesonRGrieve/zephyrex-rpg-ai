// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's instruct templates (A17): a person's own prompt markup for a text API, the
 * same resource, fields and rules as the SaaS server's (BLL_AI_Chat InstructTemplateModel).
 */
import type { Prisma } from '@prisma/client';
import type { ResourceSpec } from '@zephyrex/lite';
import { z } from 'zod';
import { INSTRUCT_CUSTOM, LIMITS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, jsonList, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';
import { activeTemplate, type InstructTemplate } from '~/features/prompt/instruct';

const COLUMNS: Columns = {
  name: plain('name'),
  start: plain('start'),
  system_prefix: plain('systemPrefix'),
  system_suffix: plain('systemSuffix'),
  user_prefix: plain('userPrefix'),
  user_suffix: plain('userSuffix'),
  assistant_prefix: plain('assistantPrefix'),
  assistant_suffix: plain('assistantSuffix'),
  stop: jsonList('stop'),
  include_names: plain('includeNames'),
  activation_regex: plain('activationRegex'),
  story_string: plain('storyString'),
  example_separator: plain('exampleSeparator'),
  chat_start: plain('chatStart'),
};

const markup = z.string().max(INSTRUCT_CUSTOM.field_characters);
const fields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  start: markup,
  system_prefix: markup,
  system_suffix: markup,
  user_prefix: markup,
  user_suffix: markup,
  assistant_prefix: markup,
  assistant_suffix: markup,
  stop: z.array(z.string().min(1).max(INSTRUCT_CUSTOM.stop_characters)).max(INSTRUCT_CUSTOM.stops),
  // SillyTavern's context template and instruct options (audit gap 4).
  include_names: z.boolean(),
  activation_regex: z.string().max(INSTRUCT_CUSTOM.activation_regex_characters),
  story_string: z.string().max(INSTRUCT_CUSTOM.story_characters),
  example_separator: markup,
  chat_start: markup,
};
const create = z.object({
  name: fields.name,
  start: markup.default(''),
  system_prefix: markup.default(''),
  system_suffix: markup.default(''),
  user_prefix: markup.default(''),
  user_suffix: markup.default(''),
  assistant_prefix: markup.default(''),
  assistant_suffix: markup.default(''),
  stop: fields.stop.default([]),
  include_names: fields.include_names.default(false),
  activation_regex: fields.activation_regex.default(''),
  story_string: fields.story_string.default(''),
  example_separator: markup.default(''),
  chat_start: markup.default(''),
});
const update = z.object(fields).partial();

type Row = Prisma.InstructTemplateGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const instructTemplates: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'instruct_template',
  plural: 'instruct_templates',
  modelName: 'InstructTemplateModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId) => prisma.instructTemplate.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.instructTemplate.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) =>
    prisma.instructTemplate.create({
      data: { createdById: ownerId, ...written(input, stamp) } as Prisma.InstructTemplateUncheckedCreateInput,
    }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.instructTemplate.updateMany({
      where: { id, updatedAt: version },
      data: written(input, stamp, userId) as Prisma.InstructTemplateUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.instructTemplate.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.instructTemplate.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};

/** The owner's template `id` as render_instruct reads it, or null when it is not theirs (or gone). */
export async function ownTemplate(ownerId: string, id: string): Promise<InstructTemplate | null> {
  const row = await instructTemplates.find(id, ownerId);
  if (row === null) return null;
  return {
    start: row.start,
    system_prefix: row.systemPrefix,
    system_suffix: row.systemSuffix,
    user_prefix: row.userPrefix,
    user_suffix: row.userSuffix,
    assistant_prefix: row.assistantPrefix,
    assistant_suffix: row.assistantSuffix,
    stop: z.array(z.string()).parse(JSON.parse(row.stop)),
    include_names: row.includeNames,
    story_string: row.storyString,
    example_separator: row.exampleSeparator,
    chat_start: row.chatStart,
  };
}

/**
 * The person's own template a model activates (audit gap 4): the first by name whose activation
 * regex matches the model's name; none when none does.
 */
export async function activatedTemplate(ownerId: string, model: string): Promise<InstructTemplate | null> {
  const rows = await prisma.instructTemplate.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } });
  const found = activeTemplate(
    model,
    rows.map((row) => ({ id: row.id, name: row.name, activation_regex: row.activationRegex })),
  );
  return found === null ? null : ownTemplate(ownerId, found.id);
}
