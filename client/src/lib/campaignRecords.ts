// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's campaign frames (A57, A58): the same resource, fields and rules as the SaaS
 * server's ai_campaign extension, with the limits read from contract/rpg_ai.json. Deleting one
 * unlinks it from the chats that named it.
 */
import type { Prisma } from '@prisma/client';
import type { ResourceSpec } from '@zephyrex/lite';
import { z } from 'zod';
import { CAMPAIGN, LIMITS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, jsonList, jsonObject, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

const COLUMNS: Columns = {
  name: plain('name'),
  premise: plain('premise'),
  genre: plain('genre'),
  dials: jsonObject('dials'),
  themes: jsonList('themes'),
  pillars: jsonObject('pillars'),
  structure: plain('structure'),
  truths: jsonList('truths'),
  characters: plain('characters'),
  resolution_mode: plain('resolutionMode'),
};

const items = z.array(z.string().trim().min(1).max(LIMITS.short_text_characters)).max(LIMITS.campaign_list_items);
const scale = (keys: readonly string[], [low, high]: readonly number[]) =>
  z.record(z.enum(keys as [string, ...string[]]), z.number().int().min(low as number).max(high as number));
const fields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  premise: z.string().max(LIMITS.card_field_characters),
  genre: z.string().max(LIMITS.short_text_characters),
  dials: scale(
    CAMPAIGN.dials.map((dial) => dial.id),
    CAMPAIGN.dial_range,
  ),
  themes: items,
  pillars: scale(CAMPAIGN.pillars, CAMPAIGN.pillar_range),
  structure: z.enum(CAMPAIGN.structures).nullable(),
  truths: items,
  characters: z.string().max(LIMITS.card_field_characters),
  resolution_mode: z.enum(CAMPAIGN.resolution_modes).nullable(),
};
const create = z.object({
  name: fields.name,
  premise: fields.premise.default(''),
  genre: fields.genre.default(''),
  dials: fields.dials.default({}),
  themes: fields.themes.default([]),
  pillars: fields.pillars.default({}),
  structure: fields.structure.default(null),
  truths: fields.truths.default([]),
  characters: fields.characters.default(''),
  resolution_mode: fields.resolution_mode.default(null),
});
const update = z.object(fields).partial();

type Row = Prisma.CampaignGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const campaigns: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'campaign',
  plural: 'campaigns',
  modelName: 'CampaignModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId) => prisma.campaign.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.campaign.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) => prisma.campaign.create({ data: { createdById: ownerId, ...written(input, stamp) } as Prisma.CampaignUncheckedCreateInput }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.campaign.updateMany({ where: { id, updatedAt: version }, data: written(input, stamp, userId) as Prisma.CampaignUncheckedUpdateManyInput });
    return count === 0 ? null : prisma.campaign.findUnique({ where: { id } });
  },
  async remove(id) {
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { createdById: true } });
    if (campaign === null) return;
    await prisma.$transaction([
      prisma.chat.updateMany({ where: { createdById: campaign.createdById, campaignId: id }, data: { campaignId: null, updatedAt: new Date() } }),
      prisma.campaign.delete({ where: { id } }),
    ]);
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};
