// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lite records against a real database, answering as server-framework answers: create with
 * defaults, the chat's references held to the owner's own records, messages listed by chat, the
 * swipe shown kept inside the swipes, a deleted message taking its branch with it, one default
 * persona, a write-only API key, and cross-site writes refused.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '~/lib/prisma';
import { PUT as putCharacter } from './character/[id]/route.lite';
import { GET as listCharacters, POST as postCharacter } from './character/route.lite';
import { DELETE as deleteMessage, PUT as putMessage } from './chat_message/[id]/route.lite';
import { GET as listMessages, POST as postMessage } from './chat_message/route.lite';
import { POST as postChat } from './chat/route.lite';
import { GET as getEndpoint } from './model_endpoint/[id]/route.lite';
import { POST as postEndpoint } from './model_endpoint/route.lite';
import { PUT as putPersona } from './persona/[id]/route.lite';
import { GET as listPersonas, POST as postPersona } from './persona/route.lite';
import { PUT as putQuickReply } from './quick_reply/[id]/route.lite';
import { POST as postQuickReply } from './quick_reply/route.lite';

beforeEach(async () => {
  await prisma.chatMessage.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.character.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.modelEndpoint.deleteMany();
  await prisma.quickReply.deleteMany();
});

function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return new NextRequest(`http://localhost/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const none = { params: Promise.resolve({}) };

async function created<T>(handler: typeof postCharacter, path: string, resource: string, fields: Record<string, unknown>) {
  const response = await handler(call(path, { method: 'POST', body: { [resource]: fields } }), none);
  expect(response.status).toBe(201);
  return { record: ((await response.json()) as Record<string, T>)[resource], etag: response.headers.get('etag') ?? '' };
}

const character = (name = 'Ada') =>
  created<Record<string, unknown> & { id: string }>(postCharacter, '/v1/character', 'character', { name });

describe('characters', () => {
  it('creates a card with every field at its default', async () => {
    const { record } = await character();
    expect(record).toMatchObject({
      name: 'Ada',
      description: '',
      first_message: '',
      alternate_greetings: [],
      tags: [],
      avatar: null,
      favourite: false,
      folder: '',
      extensions: {},
    });
  });

  it('files a card in a folder, trimmed (A51)', async () => {
    const response = await postCharacter(
      call('/v1/character', { method: 'POST', body: { character: { name: 'Ada', folder: '  Crew  ' } } }),
      none,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ character: { folder: 'Crew' } });
  });

  it('refuses an avatar that is not an image data URL', async () => {
    const response = await postCharacter(
      call('/v1/character', { method: 'POST', body: { character: { name: 'Ada', avatar: 'https://example.com/a.png' } } }),
      none,
    );
    expect(response.status).toBe(422);
  });

  it('lists favourites first, then by name', async () => {
    const { record: bram } = await character('Bram');
    await character('Ada');
    const zed = await character('Zed');
    await putCharacter(
      call(`/v1/character/${zed.record.id}`, {
        method: 'PUT',
        headers: { 'If-Match': zed.etag },
        body: { character: { favourite: true } },
      }),
      params(zed.record.id),
    );
    const list = (await (await listCharacters(call('/v1/character'), none)).json()) as { characters: { name: string }[] };
    expect(list.characters.map((one) => one.name)).toEqual(['Zed', 'Ada', bram.name as string]);
  });
});

describe('chats and messages', () => {
  it("refuses a chat with someone else's or a missing character", async () => {
    const response = await postChat(
      call('/v1/chat', { method: 'POST', body: { chat: { title: 'Lost', character_ids: ['nobody'] } } }),
      none,
    );
    expect(response.status).toBe(422);
  });

  it('keeps messages in their chat and tree, lists them by chat, and deletes a branch whole', async () => {
    const { record: ada } = await character();
    const { record: chat } = await created<{ id: string }>(postChat, '/v1/chat', 'chat', {
      title: 'Chat with Ada',
      character_ids: [ada.id],
    });
    const say = (parent: string | null, text: string, extra: Record<string, unknown> = {}) =>
      created<{ id: string }>(postMessage, '/v1/chat_message', 'chat_message', {
        chat_id: chat.id,
        parent_id: parent,
        role: 'user',
        swipes: [text],
        ...extra,
      });

    const root = await say(null, 'Hello', { role: 'character', speaker_character_id: ada.id });
    const left = await say(root.record.id, 'Left');
    await say(left.record.id, 'Left again');
    const right = await say(root.record.id, 'Right', { channel: 'ooc' });

    const listed = (await (await listMessages(call(`/v1/chat_message?chat_id=${chat.id}`), none)).json()) as {
      chat_messages: { id: string; channel: string }[];
    };
    expect(listed.chat_messages).toHaveLength(4);
    expect(listed.chat_messages.find((one) => one.id === right.record.id)).toMatchObject({ channel: 'ooc' });

    const response = await deleteMessage(
      call(`/v1/chat_message/${left.record.id}`, { method: 'DELETE', headers: { 'If-Match': left.etag } }),
      params(left.record.id),
    );
    expect(response.status).toBe(204);
    expect(await prisma.chatMessage.count({ where: { chatId: chat.id } })).toBe(2);
  });

  it('refuses a parent from another chat, a speaker not in the chat, and a swipe that is not there', async () => {
    const { record: ada } = await character();
    const { record: bram } = await character('Bram');
    const { record: one } = await created<{ id: string }>(postChat, '/v1/chat', 'chat', {
      title: 'One',
      character_ids: [ada.id],
    });
    const { record: two } = await created<{ id: string }>(postChat, '/v1/chat', 'chat', {
      title: 'Two',
      character_ids: [ada.id],
    });
    const first = await created<{ id: string }>(postMessage, '/v1/chat_message', 'chat_message', {
      chat_id: one.id,
      role: 'user',
      swipes: ['Hi'],
    });
    const post = (body: Record<string, unknown>) =>
      postMessage(call('/v1/chat_message', { method: 'POST', body: { chat_message: body } }), none);

    expect((await post({ chat_id: two.id, parent_id: first.record.id, role: 'user', swipes: ['x'] })).status).toBe(422);
    expect((await post({ chat_id: one.id, role: 'character', speaker_character_id: bram.id, swipes: ['x'] })).status).toBe(
      422,
    );
    expect((await post({ chat_id: one.id, role: 'user', swipes: ['x'], swipe_index: 1 })).status).toBe(422);
    const tooFar = await putMessage(
      call(`/v1/chat_message/${first.record.id}`, {
        method: 'PUT',
        headers: { 'If-Match': first.etag },
        body: { chat_message: { swipe_index: 3 } },
      }),
      params(first.record.id),
    );
    expect(tooFar.status).toBe(422);
  });
});

describe('personas', () => {
  it('keeps one default: making one so clears the others', async () => {
    const sam = await created<{ id: string }>(postPersona, '/v1/persona', 'persona', { name: 'Sam', is_default: true });
    const reyes = await created<{ id: string }>(postPersona, '/v1/persona', 'persona', { name: 'Reyes' });
    await putPersona(
      call(`/v1/persona/${reyes.record.id}`, {
        method: 'PUT',
        headers: { 'If-Match': reyes.etag },
        body: { persona: { is_default: true } },
      }),
      params(reyes.record.id),
    );
    const list = (await (await listPersonas(call('/v1/persona'), none)).json()) as {
      personae: { name: string; is_default: boolean }[];
    };
    expect(list.personae.map((one) => [one.name, one.is_default])).toEqual([
      ['Reyes', true],
      ['Sam', false],
    ]);
    expect(sam.record.id).toBeDefined();
  });
});

describe('model endpoints', () => {
  it('never answers with the API key, only whether one is set', async () => {
    const { record } = await created<{ id: string; has_api_key: boolean }>(
      postEndpoint,
      '/v1/model_endpoint',
      'model_endpoint',
      {
        name: 'Hosted',
        base_url: 'https://api.example.com/v1',
        model: 'big-model',
        api_key: 'sk-secret',
      },
    );
    expect(record.has_api_key).toBe(true);
    const read = await getEndpoint(call(`/v1/model_endpoint/${record.id}`), params(record.id));
    expect(JSON.stringify(await read.json())).not.toContain('sk-secret');
  });

  it('refuses an address that is not http or https', async () => {
    const response = await postEndpoint(
      call('/v1/model_endpoint', {
        method: 'POST',
        body: { model_endpoint: { name: 'x', base_url: 'file:///etc/passwd', model: 'm' } },
      }),
      none,
    );
    expect(response.status).toBe(422);
  });
});

describe('the local owner', () => {
  it('refuses a cross-site write', async () => {
    const response = await postCharacter(
      call('/v1/character', {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site' },
        body: { character: { name: 'Ada' } },
      }),
      none,
    );
    expect(response.status).toBe(403);
  });
});

describe('quick replies that run by themselves (A38)', () => {
  const post = (fields: Record<string, unknown>) =>
    postQuickReply(
      call('/v1/quick_reply', { method: 'POST', body: { quick_reply: { label: 'Q', message: 'Hi.', ...fields } } }),
      none,
    );

  it('may send on opening, fill after a reply, and never send after one (it would run without end)', async () => {
    expect(await (await post({ auto_run: 'chat_open' })).json()).toMatchObject({
      quick_reply: { action: 'send', auto_run: 'chat_open' },
    });
    expect((await post({ auto_run: 'after_reply' })).status).toBe(422);
    expect((await post({ auto_run: 'hourly' })).status).toBe(422);
    const filler = await post({ action: 'fill', auto_run: 'after_reply' });
    expect(filler.status).toBe(201);
    const { quick_reply: row } = (await filler.json()) as { quick_reply: { id: string } };
    // Nor can an update make one loop.
    const made = await putQuickReply(
      call(`/v1/quick_reply/${row.id}`, {
        method: 'PUT',
        headers: { 'If-Match': filler.headers.get('etag') ?? '' },
        body: { quick_reply: { action: 'send' } },
      }),
      params(row.id),
    );
    expect(made.status).toBe(422);
  });
});
