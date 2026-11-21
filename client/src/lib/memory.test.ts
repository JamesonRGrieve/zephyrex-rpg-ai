// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Recall by meaning (A19), lite edition, end to end against a real local HTTP server answering as an
 * OpenAI-compatible `/embeddings` does: a line's vector counts the words "coolant" and "valve".
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import { MEMORY } from '~/contract';
import { MEMORY_EXTENSION } from '~/features/memory/across';
import { prisma } from '~/lib/prisma';
import { forgetChat, memoriesFor } from './memory';

interface Received {
  path: string;
  authorization: string | undefined;
  body: { model: string; input: string[] };
}

let server: Server;
let baseUrl = '';
const received: Received[] = [];
let failing = false;

const vectorOf = (text: string) => [(text.match(/coolant/g) ?? []).length, (text.match(/valve/g) ?? []).length, 0.01];

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Received['body'];
      received.push({ path: request.url ?? '', authorization: request.headers.authorization, body });
      if (failing) {
        response.writeHead(500).end('{}');
        return;
      }
      const data = body.input.map((text, index) => ({ object: 'embedding', index, embedding: vectorOf(text) }));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  received.length = 0;
  failing = false;
  await prisma.modelEndpoint.deleteMany();
  await prisma.chatMemory.deleteMany();
  await prisma.chat.deleteMany();
});

const recent = Array.from({ length: MEMORY.recent_turns - 1 }, (_unused, index) => ({
  id: `r${index}`,
  text: `Bo: Nothing much ${index}.`,
}));
const story = (valveLine = 'Bo: The valve is rusted.') => [
  { id: 'a', text: 'Ada: The coolant pump is failing.' },
  { id: 'b', text: valveLine },
  ...recent,
  { id: 'z', text: 'Ada: Check the coolant again.' },
];

async function addEmbedder(): Promise<void> {
  await prisma.modelEndpoint.create({
    data: {
      createdById: LOCAL_OWNER_ID,
      updatedAt: new Date(),
      name: 'Embeddings',
      baseUrl,
      model: 'nomic-embed-text',
      apiKey: 'k-7',
      roles: '["embed"]',
    },
  });
}

describe('recall by meaning (A19)', () => {
  it('recalls nothing, and asks no one, without a model set to embed', async () => {
    await prisma.modelEndpoint.create({
      data: { createdById: LOCAL_OWNER_ID, updatedAt: new Date(), name: 'Chat', baseUrl, model: 'tiny', isDefault: true },
    });
    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story())).toBe('');
    expect(received).toHaveLength(0);
  });

  it('remembers the older lines once and recalls the one the story is about', async () => {
    await addEmbedder();
    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story())).toBe(
      'Earlier in the story:\nAda: The coolant pump is failing.',
    );
    expect(received[0]).toEqual({
      path: '/v1/embeddings',
      authorization: 'Bearer k-7',
      body: {
        model: 'nomic-embed-text',
        input: [
          'Bo: Nothing much 10.\nAda: Check the coolant again.',
          'Ada: The coolant pump is failing.',
          'Bo: The valve is rusted.',
        ],
      },
    });
    expect(await prisma.chatMemory.count({ where: { chatId: 'chat-1' } })).toBe(2);

    // Next turn: only the question is embedded.
    await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story());
    expect(received[1]?.body.input).toHaveLength(1);

    // An edited line is embedded again, and the old one forgotten.
    await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story('Bo: The valve and the coolant line are rusted.'));
    expect(received[2]?.body.input.slice(1)).toEqual(['Bo: The valve and the coolant line are rusted.']);
    expect(await prisma.chatMemory.findMany({ where: { chatId: 'chat-1' }, orderBy: { messageId: 'asc' } })).toMatchObject([
      { messageId: 'a', text: 'Ada: The coolant pump is failing.' },
      { messageId: 'b', text: 'Bo: The valve and the coolant line are rusted.' },
    ]);

    await forgetChat(LOCAL_OWNER_ID, 'chat-1');
    expect(await prisma.chatMemory.count()).toBe(0);
  });

  it('never stops a reply: a failing model recalls nothing', async () => {
    await addEmbedder();
    failing = true;
    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story())).toBe('');
    expect(await prisma.chatMemory.count()).toBe(0);
  });
});

describe('a character’s memory across chats (AP8)', () => {
  const ada = { id: 'c-ada', name: 'Ada', extensions: { [MEMORY_EXTENSION]: { across_chats: true } } };
  const later = [
    { id: 'l1', text: 'Bo: Where were we?' },
    { id: 'l2', text: 'Ada: Check the coolant.' },
  ];

  async function chatOf(id: string, castIds: string[], createdById = LOCAL_OWNER_ID): Promise<void> {
    await prisma.chat.create({
      data: { id, createdById, title: id, characterIds: JSON.stringify(castIds), updatedAt: new Date() },
    });
  }

  it('recalls from the other chats the character was in, only when it remembers across chats', async () => {
    await addEmbedder();
    await chatOf('chat-1', ['c-ada']);
    await chatOf('chat-2', ['c-ada']);
    await chatOf('chat-bo', ['c-bo']);
    await memoriesFor(LOCAL_OWNER_ID, 'chat-1', story());
    // Someone else's memory, however close, is never theirs to recall.
    await prisma.chatMemory.create({
      data: {
        createdById: 'someone-else',
        chatId: 'chat-1',
        messageId: 'x',
        chunkIndex: 0,
        digest: '',
        text: 'Eve: The coolant is mine.',
        model: 'nomic-embed-text',
        vector: '[1,0,0.01]',
        updatedAt: new Date(),
      },
    });

    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-2', later, undefined, { ...ada, extensions: {} })).toBe('');
    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-2', later, undefined, ada)).toBe(
      'Earlier in the story:\nFrom other chats with Ada:\nAda: The coolant pump is failing.',
    );
    // A character who was not in that chat recalls nothing from it.
    expect(await memoriesFor(LOCAL_OWNER_ID, 'chat-bo', later, undefined, { ...ada, id: 'c-bo', name: 'Bo' })).toBe('');
  });
});
