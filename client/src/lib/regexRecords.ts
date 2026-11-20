// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's regex scripts (A33, features/chat/regex.ts): the same resource, fields and
 * rules as the SaaS server's, with the limits read from contract/rpg_ai.json. Listed in the order
 * they run (`position`, then name).
 */
import type { Prisma } from '@prisma/client';
import type { ResourceSpec } from '@zephyrex/lite';
import { z } from 'zod';
import { LIMITS, REGEX } from '~/contract';
import { compileFind } from '~/features/chat/regex';
import { type Columns, columnsOf, fieldsOf, jsonList, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = {
  name: plain('name'),
  find: plain('find'),
  replace: plain('replace'),
  placements: jsonList('placements'),
  display_only: plain('displayOnly'),
  prompt_only: plain('promptOnly'),
  min_depth: plain('minDepth'),
  max_depth: plain('maxDepth'),
  enabled: plain('enabled'),
  position: plain('position'),
};

const depth = z.number().int().min(REGEX.depth_range[0]).max(REGEX.depth_range[1]).nullable();
const fields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  find: z
    .string()
    .min(1)
    .max(LIMITS.regex_pattern_characters)
    .refine((find) => compileFind(find) !== null, 'The pattern does not compile (flags: g, i, m, s)'),
  replace: z.string().max(LIMITS.regex_replacement_characters),
  placements: z
    .array(z.enum(REGEX.placements))
    .min(1)
    .refine((placements) => new Set(placements).size === placements.length, 'Each placement once'),
  display_only: z.boolean(),
  prompt_only: z.boolean(),
  min_depth: depth,
  max_depth: depth,
  enabled: z.boolean(),
  position: z.number().int().min(0).max(LIMITS.regex_scripts),
};
const scriptCreate = z
  .object({
    name: fields.name,
    find: fields.find,
    replace: fields.replace.default(''),
    placements: fields.placements.default(['ai_output']),
    display_only: fields.display_only.default(false),
    prompt_only: fields.prompt_only.default(false),
    min_depth: depth.default(null),
    max_depth: depth.default(null),
    enabled: fields.enabled.default(true),
    position: fields.position.default(0),
  })
  .refine((script) => !(script.display_only && script.prompt_only), { message: 'A script is display-only or prompt-only, not both', path: ['prompt_only'] });
const scriptUpdate = z.object(fields).partial();

type Row = Prisma.RegexScriptGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const regexScripts: ResourceSpec<Row, z.infer<typeof scriptCreate>, z.infer<typeof scriptUpdate>> = {
  resource: 'regex_script',
  plural: 'regex_scripts',
  modelName: 'RegexScriptModel',
  createSchema: scriptCreate,
  updateSchema: scriptUpdate,
  list: (ownerId) => prisma.regexScript.findMany({ where: { createdById: ownerId }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
  find: (id, ownerId) => prisma.regexScript.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) =>
    prisma.regexScript.create({ data: { createdById: ownerId, ...written(input, stamp) } as Prisma.RegexScriptUncheckedCreateInput }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.regexScript.updateMany({
      where: { id, updatedAt: version },
      data: written(input, stamp, userId) as Prisma.RegexScriptUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.regexScript.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.regexScript.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
