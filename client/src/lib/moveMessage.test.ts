// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import { prisma } from '~/lib/prisma';
import { move } from './moveMessage';

const stamp = () => ({ createdById: LOCAL_OWNER_ID, updatedAt: new Date() });
const call = (messageId: string) =>
  move(
    new NextRequest('http://localhost/api/v1/ai_chat/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move: { message_id: messageId } }),
    }),
  );

beforeEach(async () => {
  await prisma.chatMessage.deleteMany();
  await prisma.chat.deleteMany();
});

async function line() {
  const chat = await prisma.chat.create({ data: { ...stamp(), title: 'Chat', characterIds: '[]' } });
  const say = (parentId: string | null, role: string, text: string, speaker: string | null = null) =>
    prisma.chatMessage.create({
      data: { ...stamp(), chatId: chat.id, parentId, role, speakerCharacterId: speaker, swipes: JSON.stringify([text]) },
    });
  const first = await say(null, 'character', 'Hello.', 'c-ada');
  const second = await say(first.id, 'user', 'Hi.');
  const third = await say(second.id, 'character', 'Mind the coolant.', 'c-ada');
  return { chat, first, second, third, say };
}

describe('POST /v1/ai_chat/move (A9)', () => {
  it('swaps a message with the one above, speaker and all, keeping the tree', async () => {
    const { second, third } = await line();
    const response = await call(third.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ move: { message_id: second.id } });
    const upper = await prisma.chatMessage.findUniqueOrThrow({ where: { id: second.id } });
    const lower = await prisma.chatMessage.findUniqueOrThrow({ where: { id: third.id } });
    expect([upper.role, upper.speakerCharacterId, upper.swipes]).toEqual(['character', 'c-ada', '["Mind the coolant."]']);
    expect([lower.role, lower.speakerCharacterId, lower.swipes]).toEqual(['user', null, '["Hi."]']);
    expect(lower.parentId).toBe(second.id);
  });

  it('refuses the first message, a parent with other replies, and a message not found', async () => {
    const { first, second, third, say } = await line();
    expect((await call(first.id)).status).toBe(422);
    await say(second.id, 'character', 'Another reply.', 'c-ada');
    expect((await call(third.id)).status).toBe(422);
    expect((await call('nope')).status).toBe(404);
  });
});
