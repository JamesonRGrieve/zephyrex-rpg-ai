// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's data bank documents (A41): text for everyone (`global`), for one chat or for
 * one character (`scope_id` names it, and must be one of the owner's). The same resource, fields
 * and rules as the SaaS server's. Listed by `?scope=` and `?scope_id=`.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { DATA_BANK, LIMITS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = { name: plain('name'), text: plain('text'), scope: plain('scope'), scope_id: plain('scopeId') };

const fields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  text: z.string().min(1).max(LIMITS.data_document_characters),
  scope: z.enum(DATA_BANK.scopes),
  scope_id: z.string().min(1).nullable(),
};
const create = z
  .object({ name: fields.name, text: fields.text, scope: fields.scope.default('global'), scope_id: fields.scope_id.default(null) })
  .refine((document) => (document.scope === 'global') === (document.scope_id === null), {
    message: 'A global document names no chat or character; a chat or character document names one',
    path: ['scope_id'],
  });
const update = z.object({ name: fields.name, text: fields.text }).partial();

type Row = Prisma.DataDocumentGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

/** The chat or character a document names must be one of the owner's. */
async function checkScope(ownerId: string, input: z.infer<typeof create>): Promise<void> {
  if (input.scope_id === null) return;
  const where = { id: input.scope_id, createdById: ownerId };
  const found = input.scope === 'chat' ? await prisma.chat.count({ where }) : await prisma.character.count({ where });
  if (found === 0) throw validationError(`That ${input.scope} is not one of yours`, 'scope_id');
}

export const dataDocuments: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'data_document',
  plural: 'data_documents',
  modelName: 'DataDocumentModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId, query) =>
    prisma.dataDocument.findMany({
      where: {
        createdById: ownerId,
        ...(query.get('scope') === null ? {} : { scope: query.get('scope') ?? '' }),
        ...(query.get('scope_id') === null ? {} : { scopeId: query.get('scope_id') }),
      },
      orderBy: { name: 'asc' },
    }),
  find: (id, ownerId) => prisma.dataDocument.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkScope(ownerId, input);
    return prisma.dataDocument.create({ data: { createdById: ownerId, ...written(input, stamp) } as Prisma.DataDocumentUncheckedCreateInput });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.dataDocument.updateMany({ where: { id, updatedAt: version }, data: written(input, stamp, userId) as Prisma.DataDocumentUncheckedUpdateManyInput });
    return count === 0 ? null : prisma.dataDocument.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.dataDocument.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
