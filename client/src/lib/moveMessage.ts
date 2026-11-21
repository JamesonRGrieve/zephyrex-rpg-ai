// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `POST /v1/ai_chat/move` (A9), the lite edition: a message moves up by swapping what it is (role,
 * channel, speaker, swipes, the swipe shown, bookmark, pictures, X-card) with its parent, where the
 * parent has no other reply, so every branch through them sees the same order. Moving a message
 * down is moving its only reply up. BLL_AI_Chat's move_route answers the same way.
 * Request `{ "move": { "message_id" } }`; answer `{ "move": { "message_id" } }`: the parent's id,
 * which now holds the moved message.
 */
import type { NextRequest } from 'next/server';
import { apiErrorResponse, localOwner, notFound, readJsonObject, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { LIMITS } from '~/contract';
import { prisma } from '~/lib/prisma';

const moveRequest = z.object({ message_id: z.string().min(1) });

/** The columns of what a message is, as against where it sits in the tree. */
const MOVED = [
  'role',
  'channel',
  'speakerCharacterId',
  'swipes',
  'swipeIndex',
  'bookmarked',
  'images',
  'xCarded',
  'hidden',
] as const;

export async function move(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = moveRequest.safeParse(Reflect.get(envelope, 'move'));
    if (!parsed.success) throw validationError('A move object with a message_id is required', 'move');
    const message = await prisma.chatMessage.findFirst({ where: { id: parsed.data.message_id, createdById: owner.id } });
    if (message === null) throw notFound('ChatMessageModel');
    if (message.parentId === null) throw validationError('The first message has nothing above it', 'message_id');
    const parent = await prisma.chatMessage.findFirst({ where: { id: message.parentId, createdById: owner.id } });
    if (parent === null) throw notFound('ChatMessageModel');
    // Only along one branch: with other replies under the parent, a swap would reorder their branches too.
    const replies = await prisma.chatMessage.count({ where: { parentId: parent.id, createdById: owner.id } });
    if (replies !== 1) throw validationError('Its parent has other replies, so it can’t move up', 'message_id');
    const pick = (row: typeof message) => Object.fromEntries(MOVED.map((column) => [column, row[column]]));
    const stamp = new Date();
    await prisma.$transaction([
      prisma.chatMessage.update({
        where: { id: parent.id },
        data: { ...pick(message), updatedAt: stamp, updatedById: owner.id },
      }),
      prisma.chatMessage.update({
        where: { id: message.id },
        data: { ...pick(parent), updatedAt: stamp, updatedById: owner.id },
      }),
    ]);
    return Response.json({ move: { message_id: parent.id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const cutRequest = z.object({ message_ids: z.array(z.string().min(1)).min(1).max(LIMITS.cut_messages) });

/**
 * `POST /v1/ai_chat/cut` (STscript's /cut, audit gap 5): the messages named leave the chat, and
 * only they do: each one's replies move up to its parent, so the branch through it carries on
 * without it. BLL_AI_Chat's cut_route answers the same way. Request `{ "cut": { "message_ids" } }`
 * (all of one chat); answer `{ "cut": { "message_ids" } }`, the ones cut.
 */
export async function cut(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = cutRequest.safeParse(Reflect.get(envelope, 'cut'));
    if (!parsed.success) throw validationError('A cut object with message_ids is required', 'cut');
    const ids = [...new Set(parsed.data.message_ids)];
    const found = await prisma.chatMessage.findMany({ where: { id: { in: ids }, createdById: owner.id } });
    if (found.length !== ids.length) throw notFound('ChatMessageModel');
    if (new Set(found.map((message) => message.chatId)).size !== 1)
      throw validationError('The messages cut must all be in one chat', 'message_ids');
    const stamp = new Date();
    // One at a time, reading each one's parent as it now is: a cut line under another cut line
    // hands its replies on to the nearest line kept.
    for (const id of ids) {
      const message = await prisma.chatMessage.findUniqueOrThrow({ where: { id } });
      await prisma.$transaction([
        prisma.chatMessage.updateMany({
          where: { parentId: id },
          data: { parentId: message.parentId, updatedAt: stamp, updatedById: owner.id },
        }),
        prisma.chatMessage.delete({ where: { id } }),
      ]);
    }
    return Response.json({ cut: { message_ids: ids } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
