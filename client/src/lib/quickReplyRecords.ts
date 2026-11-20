// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's quick replies (A32, A38): buttons above the composer that send or fill in a
 * saved line. The same resource, fields and rules as the SaaS server's, listed in their order.
 */
import type { Prisma } from '@prisma/client';
import type { ResourceSpec } from '@zephyrex/lite';
import { z } from 'zod';
import { LIMITS, QUICK_REPLY } from '~/contract';
import { type Columns, columnsOf, fieldsOf, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = {
  label: plain('label'),
  message: plain('message'),
  action: plain('action'),
  channel: plain('channel'),
  enabled: plain('enabled'),
  position: plain('position'),
};

const fields = {
  label: z.string().trim().min(1).max(LIMITS.quick_reply_label_characters),
  message: z.string().trim().min(1).max(LIMITS.message_characters),
  action: z.enum(QUICK_REPLY.actions),
  channel: z.enum(QUICK_REPLY.channels),
  enabled: z.boolean(),
  position: z.number().int().min(0).max(LIMITS.quick_replies),
};
const create = z.object({
  label: fields.label,
  message: fields.message,
  action: fields.action.default('send'),
  channel: fields.channel.default('ic'),
  enabled: fields.enabled.default(true),
  position: fields.position.default(0),
});
const update = z.object(fields).partial();

type Row = Prisma.QuickReplyGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const quickReplies: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'quick_reply',
  plural: 'quick_replies',
  modelName: 'QuickReplyModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId) => prisma.quickReply.findMany({ where: { createdById: ownerId }, orderBy: [{ position: 'asc' }, { label: 'asc' }] }),
  find: (id, ownerId) => prisma.quickReply.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) => prisma.quickReply.create({ data: { createdById: ownerId, ...written(input, stamp) } as Prisma.QuickReplyUncheckedCreateInput }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.quickReply.updateMany({ where: { id, updatedAt: version }, data: written(input, stamp, userId) as Prisma.QuickReplyUncheckedUpdateManyInput });
    return count === 0 ? null : prisma.quickReply.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.quickReply.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
