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
import { prisma } from '~/lib/prisma';

const moveRequest = z.object({ message_id: z.string().min(1) });

/** The columns of what a message is, as against where it sits in the tree. */
const MOVED = ['role', 'channel', 'speakerCharacterId', 'swipes', 'swipeIndex', 'bookmarked', 'images', 'xCarded'] as const;

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
