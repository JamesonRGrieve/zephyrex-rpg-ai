// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A campaign's sessions in the lite edition (docs/DESIGN.md, The play model): segments of the
 * campaign's story, each starting at one of its messages and, once ended, carrying the summary
 * later sessions read instead of its lines (features/chat/play). The SaaS twin is
 * server/extensions/ai_chat/BLL_AI_Session.py.
 */
import type { Prisma } from '@prisma/client';
import { type ResourceSpec, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { LIMITS } from '~/contract';
import { type Columns, columnsOf, fieldsOf, plain } from '~/lib/columns';
import { prisma } from '~/lib/prisma';

type SessionRow = Prisma.ChatSessionGetPayload<object>;

const SESSION_COLUMNS: Columns = {
  chat_id: plain('chatId'),
  number: plain('number'),
  title: plain('title'),
  start_message_id: plain('startMessageId'),
  summary: plain('summary'),
  ended_at: plain('endedAt'),
};

const sessionCreate = z.object({
  chat_id: z.string().min(1),
  number: z.number().int().min(1),
  title: z.string().max(LIMITS.chat_title_characters).default(''),
  start_message_id: z.string().min(1),
  summary: z.string().max(LIMITS.chat_summary_characters).default(''),
  ended_at: z.string().datetime({ offset: true }).nullable().default(null),
});
const sessionUpdate = z
  .object({
    title: z.string().max(LIMITS.chat_title_characters),
    summary: z.string().max(LIMITS.chat_summary_characters),
    ended_at: z.string().datetime({ offset: true }).nullable(),
  })
  .partial();

async function checkSession(ownerId: string, input: z.infer<typeof sessionCreate>): Promise<void> {
  const chat = await prisma.chat.count({ where: { id: input.chat_id, createdById: ownerId } });
  if (chat === 0) throw validationError('The chat must be one of yours', 'chat_id');
  const start = await prisma.chatMessage.count({ where: { id: input.start_message_id, chatId: input.chat_id } });
  if (start === 0) throw validationError('The session must start at a message of its chat', 'start_message_id');
}

export const chatSessions: ResourceSpec<SessionRow, z.infer<typeof sessionCreate>, z.infer<typeof sessionUpdate>> = {
  resource: 'chat_session',
  plural: 'chat_sessions',
  modelName: 'ChatSessionModel',
  createSchema: sessionCreate,
  updateSchema: sessionUpdate,
  list(ownerId, query) {
    const chatId = query.get('chat_id');
    return prisma.chatSession.findMany({
      where: { createdById: ownerId, ...(chatId === null ? {} : { chatId }) },
      orderBy: { number: 'asc' },
    });
  },
  find: (id, ownerId) => prisma.chatSession.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    await checkSession(ownerId, input);
    return prisma.chatSession.create({
      data: {
        createdById: ownerId,
        ...columnsOf(SESSION_COLUMNS, input),
        updatedAt: stamp,
      } as Prisma.ChatSessionUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.chatSession.updateMany({
      where: { id, updatedAt: version },
      data: {
        ...columnsOf(SESSION_COLUMNS, input),
        updatedAt: stamp,
        ...(userId === undefined ? {} : { updatedById: userId }),
      } as Prisma.ChatSessionUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.chatSession.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.chatSession.deleteMany({ where: { id } });
  },
  fields: (row) => fieldsOf(SESSION_COLUMNS, row),
};

type PlayRow = Prisma.CampaignPlayGetPayload<object>;

const PLAY_COLUMNS: Columns = {
  chat_id: plain('chatId'),
  playing_id: plain('playingId'),
  forked_from_id: plain('forkedFromId'),
  forked_at_message_id: plain('forkedAtMessageId'),
};

const playCreate = z.object({
  chat_id: z.string().min(1),
  playing_id: z.string().min(1).nullable().default(null),
  forked_from_id: z.string().min(1).nullable().default(null),
  forked_at_message_id: z.string().min(1).nullable().default(null),
});
const playUpdate = z.object({ playing_id: z.string().min(1).nullable() }).partial();

/** A campaign's play state: the chat holding its story is a campaign (docs/DESIGN.md, The play model). */
export const campaignPlays: ResourceSpec<PlayRow, z.infer<typeof playCreate>, z.infer<typeof playUpdate>> = {
  resource: 'campaign_play',
  plural: 'campaign_plays',
  modelName: 'CampaignPlayModel',
  createSchema: playCreate,
  updateSchema: playUpdate,
  list(ownerId, query) {
    const chatId = query.get('chat_id');
    return prisma.campaignPlay.findMany({ where: { createdById: ownerId, ...(chatId === null ? {} : { chatId }) } });
  },
  find: (id, ownerId) => prisma.campaignPlay.findFirst({ where: { id, createdById: ownerId } }),
  async insert(ownerId, input, stamp) {
    const chat = await prisma.chat.count({ where: { id: input.chat_id, createdById: ownerId } });
    if (chat === 0) throw validationError('The chat must be one of yours', 'chat_id');
    if ((await prisma.campaignPlay.count({ where: { chatId: input.chat_id } })) > 0) {
      throw validationError('That chat is already a campaign', 'chat_id');
    }
    return prisma.campaignPlay.create({
      data: {
        createdById: ownerId,
        ...columnsOf(PLAY_COLUMNS, input),
        updatedAt: stamp,
      } as Prisma.CampaignPlayUncheckedCreateInput,
    });
  },
  async updateIfCurrent(id, version, input, stamp, userId) {
    const { count } = await prisma.campaignPlay.updateMany({
      where: { id, updatedAt: version },
      data: {
        ...columnsOf(PLAY_COLUMNS, input),
        updatedAt: stamp,
        ...(userId === undefined ? {} : { updatedById: userId }),
      } as Prisma.CampaignPlayUncheckedUpdateManyInput,
    });
    return count === 0 ? null : prisma.campaignPlay.findUnique({ where: { id } });
  },
  async remove(id) {
    await prisma.campaignPlay.deleteMany({ where: { id } });
  },
  fields: (row) => fieldsOf(PLAY_COLUMNS, row),
};
