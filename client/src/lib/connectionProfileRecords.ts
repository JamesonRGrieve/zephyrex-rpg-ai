// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's connection profiles (audit gap 8): a named model and preset a chat switches to
 * in one step, as SillyTavern's connection profiles do. The model carries its API, address, key and
 * instruct template; the preset its samplers and prompt layout. The same resource, fields and rules
 * as the SaaS server's (BLL_AI_Profile.py), listed by name.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { LIMITS, SEARCH_APIS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = {
  name: plain('name'),
  endpoint_id: plain('endpointId'),
  preset_id: plain('presetId'),
};

const fields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  endpoint_id: z.string().min(1).nullable(),
  preset_id: z.string().min(1).nullable(),
};
const create = z.object({
  name: fields.name,
  endpoint_id: fields.endpoint_id.default(null),
  preset_id: fields.preset_id.default(null),
});
const update = z.object(fields).partial();

type Row = Prisma.ConnectionProfileGetPayload<object>;

/** A profile names only the person's own model (never a search source) and preset. */
async function checkReferences(ownerId: string, input: { endpoint_id?: string | null; preset_id?: string | null }) {
  if (input.endpoint_id != null) {
    const endpoint = await prisma.modelEndpoint.findFirst({ where: { id: input.endpoint_id, createdById: ownerId } });
    if (endpoint === null || (SEARCH_APIS as readonly string[]).includes(endpoint.api))
      throw validationError('The model must be one of yours', 'endpoint_id');
  }
  if (input.preset_id != null) {
    const found = await prisma.generationPreset.count({ where: { id: input.preset_id, createdById: ownerId } });
    if (found === 0) throw validationError('The preset must be one of yours', 'preset_id');
  }
}

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const connectionProfiles: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'connection_profile',
  plural: 'connection_profiles',
  modelName: 'ConnectionProfileModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId) => prisma.connectionProfile.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.connectionProfile.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkReferences(ownerId, input);
    return prisma.connectionProfile.create({
      data: { createdById: ownerId, ...written(input, stamp) } as Prisma.ConnectionProfileUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const current = await prisma.connectionProfile.findUnique({ where: { id } });
    if (current !== null) await checkReferences(current.createdById, input);
    const { count } = await prisma.connectionProfile.updateMany({
      where: { id, updatedAt: version },
      data: written(input, stamp, userId) as Prisma.ConnectionProfileUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.connectionProfile.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.connectionProfile.delete({ where: { id } });
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
