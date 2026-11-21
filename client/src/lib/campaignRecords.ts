// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite edition's campaign frames (A57, A58): the same resource, fields and rules as the SaaS
 * server's ai_campaign extension, with the limits read from contract/rpg_ai.json. Deleting one
 * unlinks it from the chats that named it. And scenarios (A59-A61), with their state in play.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { CAMPAIGN, LIMITS, SCENARIO, SPEECH } from '~/contract';
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
  gm_style: plain('gmStyle'),
  wiki_campaign_id: plain('wikiCampaignId'),
};

const items = z.array(z.string().trim().min(1).max(LIMITS.short_text_characters)).max(LIMITS.campaign_list_items);
const scale = (keys: readonly string[], [low, high]: readonly number[]) =>
  z.record(
    z.enum(keys as [string, ...string[]]),
    z
      .number()
      .int()
      .min(low as number)
      .max(high as number),
  );
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
  gm_style: z.string().max(LIMITS.card_field_characters),
  wiki_campaign_id: z.string().max(LIMITS.short_text_characters).nullable(),
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
  gm_style: fields.gm_style.default(''),
  wiki_campaign_id: fields.wiki_campaign_id.default(null),
});
const update = z.object(fields).partial();

type Row = Prisma.CampaignFrameGetPayload<object>;

function written(input: object, stamp: Date, userId?: string): Record<string, unknown> {
  return { ...columnsOf(COLUMNS, input), updatedAt: stamp, ...(userId === undefined ? {} : { updatedById: userId }) };
}

export const campaigns: ResourceSpec<Row, z.infer<typeof create>, z.infer<typeof update>> = {
  resource: 'campaign_frame',
  plural: 'campaign_frames',
  modelName: 'CampaignFrameModel',
  createSchema: create,
  updateSchema: update,
  list: (ownerId) => prisma.campaignFrame.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.campaignFrame.findFirst({ where: { id, createdById: ownerId } }),
  insert: (ownerId, input, stamp) =>
    prisma.campaignFrame.create({
      data: { createdById: ownerId, ...written(input, stamp) } as Prisma.CampaignFrameUncheckedCreateInput,
    }),
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.campaignFrame.updateMany({
      where: { id, updatedAt: version },
      data: written(input, stamp, userId) as Prisma.CampaignFrameUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.campaignFrame.findUnique({ where: { id } });
  },
  async remove(id) {
    const campaign = await prisma.campaignFrame.findUnique({ where: { id }, select: { createdById: true } });
    if (campaign === null) return;
    await prisma.$transaction([
      prisma.chat.updateMany({
        where: { createdById: campaign.createdById, campaignId: id },
        data: { campaignId: null, updatedAt: new Date() },
      }),
      prisma.campaignFrame.delete({ where: { id } }),
    ]);
  },
  fields: (row) => fieldsOf(COLUMNS, row),
};

// ---- scenario -----------------------------------------------------------------------------

const SCENARIO_COLUMNS: Columns = {
  name: plain('name'),
  campaign_id: plain('campaignId'),
  premise: plain('premise'),
  hook: plain('hook'),
  stakes: plain('stakes'),
  situation: plain('situation'),
  cast: jsonList('cast'),
  places: jsonList('places'),
  clocks: jsonList('clocks'),
  secrets: jsonList('secrets'),
  beats: jsonList('beats'),
  outcomes: jsonList('outcomes'),
};

const limits = SCENARIO.limits;
const short = z.string().trim().max(LIMITS.short_text_characters);
const long = z.string().trim().max(LIMITS.card_field_characters);
const named = z.string().trim().min(1).max(LIMITS.short_text_characters);
const [fewestSegments, mostSegments] = SCENARIO.clock_segment_range as [number, number];
const clock = z
  .object({
    name: named,
    segments: z.number().int().min(fewestSegments).max(mostSegments),
    filled: z.number().int().min(0),
    advances: short,
    when_full: short,
  })
  .strict()
  .refine((one) => one.filled <= one.segments, {
    message: 'A clock’s filled segments are 0 to its segments',
    path: ['filled'],
  });
/**
 * An NPC's voice (voice acting): the same shape as a character's (features/speech/voice.ts), checked
 * loosely here as the server checks it; voiceOf clamps rate and pitch to their ranges when read.
 */
const npcVoice = z
  .object({
    name: z.string().max(SPEECH.voice_characters).nullable(),
    rate: z.number().min(0).max(SPEECH.speed_range[1]),
    pitch: z.number().min(0).max(SPEECH.speed_range[1]),
    server: z.string().max(SPEECH.voice_characters).nullable(),
  })
  .partial()
  .strict();
const scenarioFields = {
  name: z.string().trim().min(1).max(LIMITS.name_characters),
  campaign_id: z.string().min(1).nullable(),
  premise: long,
  hook: long,
  stakes: long,
  situation: long,
  cast: z
    .array(z.object({ name: named, agenda: long, secret: long, disposition: short, voice: npcVoice.optional() }).strict())
    .max(limits.cast),
  places: z.array(named).max(limits.places),
  clocks: z.array(clock).max(limits.clocks),
  secrets: z
    .array(
      z
        .object({
          truth: z.string().trim().min(1).max(LIMITS.card_field_characters),
          clues: z.array(z.object({ text: named, found: z.boolean() }).strict()).max(limits.clues_per_secret),
        })
        .strict(),
    )
    .max(limits.secrets),
  beats: z.array(z.object({ text: named, done: z.boolean() }).strict()).max(limits.beats),
  outcomes: z.array(named).max(limits.outcomes),
};
const scenarioCreate = z.object({
  name: scenarioFields.name,
  campaign_id: scenarioFields.campaign_id.default(null),
  premise: long.default(''),
  hook: long.default(''),
  stakes: long.default(''),
  situation: long.default(''),
  cast: scenarioFields.cast.default([]),
  places: scenarioFields.places.default([]),
  clocks: scenarioFields.clocks.default([]),
  secrets: scenarioFields.secrets.default([]),
  beats: scenarioFields.beats.default([]),
  outcomes: scenarioFields.outcomes.default([]),
});
const scenarioUpdate = z.object(scenarioFields).partial();

type ScenarioRow = Prisma.ScenarioGetPayload<object>;

async function checkCampaign(ownerId: string, campaignId: string | null | undefined): Promise<void> {
  if (campaignId === null || campaignId === undefined) return;
  if ((await prisma.campaignFrame.count({ where: { id: campaignId, createdById: ownerId } })) === 0)
    throw validationError('That campaign is not one of yours', 'campaign_id');
}

export const scenarios: ResourceSpec<ScenarioRow, z.infer<typeof scenarioCreate>, z.infer<typeof scenarioUpdate>> = {
  resource: 'scenario',
  plural: 'scenarios',
  modelName: 'ScenarioModel',
  createSchema: scenarioCreate,
  updateSchema: scenarioUpdate,
  list: (ownerId) => prisma.scenario.findMany({ where: { createdById: ownerId }, orderBy: { name: 'asc' } }),
  find: (id, ownerId) => prisma.scenario.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkCampaign(ownerId, input.campaign_id);
    return prisma.scenario.create({
      data: {
        createdById: ownerId,
        ...columnsOf(SCENARIO_COLUMNS, input),
        updatedAt: stamp,
      } as Prisma.ScenarioUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const row = await prisma.scenario.findUnique({ where: { id }, select: { createdById: true } });
    if (row !== null) await checkCampaign(row.createdById, input.campaign_id);
    const { count } = await prisma.scenario.updateMany({
      where: { id, updatedAt: version },
      data: {
        ...columnsOf(SCENARIO_COLUMNS, input),
        updatedAt: stamp,
        ...(userId === undefined ? {} : { updatedById: userId }),
      } as Prisma.ScenarioUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.scenario.findUnique({ where: { id } });
  },
  async remove(id) {
    const scenario = await prisma.scenario.findUnique({ where: { id }, select: { createdById: true } });
    if (scenario === null) return;
    await prisma.$transaction([
      prisma.chat.updateMany({
        where: { createdById: scenario.createdById, scenarioId: id },
        data: { scenarioId: null, updatedAt: new Date() },
      }),
      prisma.scenario.delete({ where: { id } }),
    ]);
  },
  fields: (row) => fieldsOf(SCENARIO_COLUMNS, row),
};
