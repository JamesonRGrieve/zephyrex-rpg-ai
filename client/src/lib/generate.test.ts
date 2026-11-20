// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The generate route end to end against a real local HTTP server that answers as an
 * OpenAI-compatible endpoint does: the reply streams through, the model receives the assembled
 * prompt (and never the table talk), refusals come back as the framework's errors.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import { prisma } from '~/lib/prisma';
import { completionsUrl, generate, inspectPrompt, summarize, translate, upstreamBody, withImages } from './generate';

interface Received {
  path: string;
  authorization: string | undefined;
  body: { model: string; stream: boolean; messages: { role: string; content: string }[] };
}

let server: Server;
let baseUrl = '';
const received: Received[] = [];
let answer: 'stream' | 'refuse' = 'stream';

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

beforeAll(async () => {
  server = createServer((request, response) => {
    void readBody(request).then((text) => {
      received.push({ path: request.url ?? '', authorization: request.headers.authorization, body: JSON.parse(text) as Received['body'] });
      if (answer === 'refuse') {
        response.writeHead(401).end('{"error":"bad key"}');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const piece of ['“Mind ', 'the coolant.”']) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      response.end('data: [DONE]\n\n');
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
  answer = 'stream';
  await prisma.chatMessage.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.character.deleteMany();
  await prisma.modelEndpoint.deleteMany();
});

const stamp = () => ({ createdById: LOCAL_OWNER_ID, updatedAt: new Date() });

async function seed(withEndpoint = true) {
  const ada = await prisma.character.create({ data: { ...stamp(), name: 'Ada', description: '{{char}} is an engineer.' } });
  if (withEndpoint) await prisma.modelEndpoint.create({ data: { ...stamp(), name: 'Local', baseUrl, model: 'tiny', apiKey: 'k-1', isDefault: true } });
  const chat = await prisma.chat.create({ data: { ...stamp(), title: 'Chat', characterIds: JSON.stringify([ada.id]) } });
  const ooc = await prisma.chatMessage.create({ data: { ...stamp(), chatId: chat.id, role: 'user', channel: 'ooc', swipes: '["brb, coffee"]' } });
  const line = await prisma.chatMessage.create({ data: { ...stamp(), chatId: chat.id, parentId: ooc.id, role: 'user', swipes: '["I hand her the spanner."]' } });
  return { ada, chat, line };
}

function call(body: unknown) {
  return new NextRequest('http://localhost/api/v1/ai_chat/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function events(response: Response): Promise<string> {
  return response.text();
}

describe('POST /v1/ai_chat/generate', () => {
  it('streams the reply and gives the model the prompt without table talk', async () => {
    const { chat, line } = await seed();
    const response = await generate(call({ generate: { chat_id: chat.id, leaf_id: line.id } }));
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await events(response);
    expect(text).toContain('event: delta\ndata: {"text":"“Mind "}');
    expect(text).toContain('event: done\ndata: {"dropped":0}');

    expect(received).toHaveLength(1);
    const [sent] = received;
    expect(sent?.path).toBe('/v1/chat/completions');
    expect(sent?.authorization).toBe('Bearer k-1');
    expect(sent?.body).toMatchObject({ model: 'tiny', stream: true });
    const contents = sent?.body.messages.map((message) => message.content) ?? [];
    expect(contents[0]).toContain('Ada is an engineer.');
    expect(contents).toContain('I hand her the spanner.');
    expect(contents.join('\n')).not.toContain('brb, coffee');
  });

  it('asks for a model endpoint first (409)', async () => {
    const { chat } = await seed(false);
    const response = await generate(call({ generate: { chat_id: chat.id, leaf_id: null } }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ detail: { code: 'no_model_endpoint' } });
  });

  it('answers 502 when the model refuses, 404 for an unknown chat and 422 for a bad request', async () => {
    const { chat } = await seed();
    answer = 'refuse';
    expect((await generate(call({ generate: { chat_id: chat.id, leaf_id: null } }))).status).toBe(502);
    expect((await generate(call({ generate: { chat_id: 'missing', leaf_id: null } }))).status).toBe(404);
    expect((await generate(call({ chat_id: chat.id }))).status).toBe(422);
    expect((await generate(call({ generate: { chat_id: chat.id, leaf_id: 'not-in-chat' } }))).status).toBe(422);
  });
});

describe('World Info in a reply', () => {
  it('gives the model the entries the branch activates, and keeps a sticky entry’s timer', async () => {
    await prisma.lorebookEntry.deleteMany();
    await prisma.lorebook.deleteMany();
    await prisma.chatLoreState.deleteMany();
    const { chat, line } = await seed();
    const book = await prisma.lorebook.create({ data: { ...stamp(), name: 'Kestrel' } });
    await prisma.lorebookEntry.create({
      data: { ...stamp(), lorebookId: book.id, keys: '["spanner"]', content: 'The Kestrel’s spanners are cursed.', sticky: 2 },
    });
    await prisma.lorebookEntry.create({ data: { ...stamp(), lorebookId: book.id, keys: '["coffee"]', content: 'never: only table talk says coffee' } });
    await prisma.chat.update({ where: { id: chat.id }, data: { lorebookIds: JSON.stringify([book.id]) } });

    const response = await generate(call({ generate: { chat_id: chat.id, leaf_id: line.id } }));
    await events(response);
    const system = received[0]?.body.messages[0]?.content ?? '';
    expect(system).toContain('The Kestrel’s spanners are cursed.');
    expect(system).not.toContain('never: only table talk says coffee');

    const saved = await prisma.chatLoreState.findUnique({ where: { chatId: chat.id } });
    expect(Object.values(JSON.parse(saved?.state ?? '{}') as Record<string, { sticky_until: number }>)).toEqual([{ sticky_until: 3, cooldown_until: 0 }]);
  });
});

describe('POST /v1/ai_chat/prompt', () => {
  it('shows what the model would be given, with token estimates, without asking it or moving the lore timers', async () => {
    await prisma.chatLoreState.deleteMany();
    const { chat, line } = await seed();
    const response = await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: line.id } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { prompt: { messages: { role: string; content: string; tokens: number }[]; tokens: number; dropped: number } };
    expect(body.prompt.messages.at(-1)).toMatchObject({ role: 'user', content: 'I hand her the spanner.' });
    expect(body.prompt.tokens).toBe(body.prompt.messages.reduce((total, message) => total + message.tokens, 0));
    expect(received).toHaveLength(0);
    expect(await prisma.chatLoreState.count()).toBe(0);
  });

  it('asks for the person’s own line when impersonating', async () => {
    const { chat, line } = await seed();
    const response = await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: line.id, mode: 'impersonate' } }));
    const body = (await response.json()) as { prompt: { messages: { content: string }[] } };
    expect(body.prompt.messages.at(-1)?.content).toContain("Write User's next reply");
    expect((await inspectPrompt(call({ generate: { chat_id: chat.id, mode: 'sing' } }))).status).toBe(422);
  });
});

describe('POST /v1/ai_chat/summarize', () => {
  it('asks the model to summarise the branch’s story, table talk left out, and writes nothing', async () => {
    const { chat, line } = await seed();
    const response = await summarize(call({ generate: { chat_id: chat.id, leaf_id: line.id } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ summary: { text: '“Mind the coolant.”', dropped: 0 } });
    expect(received[0]?.body.messages[1]?.content).toBe('User: I hand her the spanner.');
    expect((await prisma.chat.findUniqueOrThrow({ where: { id: chat.id } })).summary).toBe('');
  });

  it('reads a saved summary into the prompt, and answers 502 when the model refuses', async () => {
    const { chat, line } = await seed();
    await prisma.chat.update({ where: { id: chat.id }, data: { summary: 'They met in the engine room.' } });
    const inspected = (await (await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: line.id } }))).json()) as { prompt: { messages: { content: string }[] } };
    expect(inspected.prompt.messages[0]?.content.endsWith('Summary of the story so far:\nThey met in the engine room.')).toBe(true);
    answer = 'refuse';
    expect((await summarize(call({ generate: { chat_id: chat.id } }))).status).toBe(502);
  });
});

describe('POST /v1/ai_chat/translate', () => {
  it('asks the chat’s model for the translation and answers with it', async () => {
    const { chat } = await seed();
    const response = await translate(call({ translate: { chat_id: chat.id, text: 'Bonjour.', language: 'English' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ translate: { chat_id: chat.id, text: '“Mind the coolant.”', language: 'English' } });
    expect(received[0]?.body.messages).toEqual([
      { role: 'system', content: "Translate the user's text into English. Keep its meaning, tone, names and any *action* markup. Write only the translation." },
      { role: 'user', content: 'Bonjour.' },
    ]);
    expect((await translate(call({ translate: { chat_id: chat.id, text: '' } }))).status).toBe(422);
  });
});

describe('the data bank', () => {
  it('puts the notes the story is about into the prompt: everyone’s, the chat’s and the cast’s', async () => {
    await prisma.dataDocument.deleteMany();
    const { ada, chat, line } = await seed();
    await prisma.dataDocument.create({ data: { ...stamp(), name: 'Tools', text: 'The spanner rack is by the hatch.' } });
    await prisma.dataDocument.create({ data: { ...stamp(), name: 'Ada', text: 'Ada keeps her own spanner.', scope: 'character', scopeId: ada.id } });
    await prisma.dataDocument.create({ data: { ...stamp(), name: 'Food', text: 'Bram cooks stew.' } });
    const body = (await (await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: line.id } }))).json()) as { prompt: { messages: { content: string }[] } };
    const system = body.prompt.messages[0]?.content ?? '';
    expect(system).toContain('Notes that may be relevant:\nThe spanner rack is by the hatch.\n\nAda keeps her own spanner.');
    expect(system).not.toContain('stew');
  });
});

describe('the table GM and the pause', () => {
  it('answers table talk as the GM, and a paused table gets no story turn but still its GM', async () => {
    const { chat, line } = await seed();
    const question = await prisma.chatMessage.create({ data: { ...stamp(), chatId: chat.id, parentId: line.id, role: 'user', channel: 'gm', swipes: '["Can I search it?"]' } });
    await prisma.chat.update({ where: { id: chat.id }, data: { paused: true, tableNotes: JSON.stringify([{ kind: 'house_rule', text: 'Crits explode.' }]) } });
    const refused = await generate(call({ generate: { chat_id: chat.id, leaf_id: question.id } }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ detail: { code: 'paused' } });
    const table = await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: question.id, mode: 'table' } }));
    const body = (await table.json()) as { prompt: { messages: { role: string; content: string }[] } };
    expect(body.prompt.messages[0]?.content).toContain('House rule: Crits explode.');
    expect(body.prompt.messages.at(-1)).toEqual({ role: 'user', content: 'User: Can I search it?', tokens: expect.any(Number) });
    expect((await generate(call({ generate: { chat_id: chat.id, leaf_id: question.id, mode: 'table' } }))).status).toBe(200);
  });
});

describe('the prompt manager', () => {
  it('lays the system text out as the chat’s preset says, with the chat’s own system prompt', async () => {
    const { chat, line } = await seed();
    const layout = [
      { id: 'description', enabled: true, max_tokens: null },
      { id: 'main', enabled: true, max_tokens: 2 },
    ];
    const preset = await prisma.generationPreset.create({
      data: { ...stamp(), name: 'Layout', temperature: 0.7, topP: 1, topK: 0, repetitionPenalty: 1, maxTokens: 200, contextTokens: 4096, promptLayout: JSON.stringify(layout) },
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { presetId: preset.id, systemPrompt: 'Narrate {{char}} closely.' } });
    const response = await inspectPrompt(call({ generate: { chat_id: chat.id, leaf_id: line.id } }));
    const body = (await response.json()) as { prompt: { messages: { content: string }[] } };
    expect(body.prompt.messages[0]?.content).toBe('Ada is an engineer.\n\nNarrate');
  });
});

describe('completionsUrl', () => {
  it('appends /chat/completions once, whatever the trailing slashes', () => {
    expect(completionsUrl('http://h:1/v1')).toBe('http://h:1/v1/chat/completions');
    expect(completionsUrl('http://h:1/v1//')).toBe('http://h:1/v1/chat/completions');
    expect(completionsUrl('http://h:1/v1/chat/completions')).toBe('http://h:1/v1/chat/completions');
  });

  it('points a text API at /completions, whichever path it was given', () => {
    expect(completionsUrl('http://h:1/v1', 'text')).toBe('http://h:1/v1/completions');
    expect(completionsUrl('http://h:1/v1/chat/completions', 'text')).toBe('http://h:1/v1/completions');
    expect(completionsUrl('http://h:1/v1/completions', 'text')).toBe('http://h:1/v1/completions');
  });
});

describe('withImages', () => {
  it('adds the pictures to the last user message as content parts, and leaves the rest alone', () => {
    const messages = [
      { role: 'system' as const, content: 'You are Ada.' },
      { role: 'user' as const, content: 'Old line.' },
      { role: 'assistant' as const, content: 'Hi.' },
      { role: 'user' as const, content: 'What is this?' },
    ];
    expect(withImages(messages, [])).toEqual(messages);
    expect(withImages(messages, ['data:image/png;base64,AAAA'])).toEqual([
      ...messages.slice(0, 3),
      { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
    ]);
  });
});

describe('upstreamBody', () => {
  const sampler = { temperature: 0.7, top_p: 1, top_k: 0, repetition_penalty: 1, max_tokens: 100, context_tokens: 2048, stop: ['END'], prompt_layout: [] };
  const messages = [
    { role: 'user' as const, content: 'Hi.' },
    { role: 'assistant' as const, content: 'Hel' },
  ];

  it('sends a chat API the messages and the preset’s stops', () => {
    const body = upstreamBody({ base_url: 'http://h', model: 'm', api_key: '', api: 'chat', instruct_template: 'chatml' }, sampler, messages, 'reply');
    expect(body).toMatchObject({ messages, stop: ['END'] });
    expect(body).not.toHaveProperty('prompt');
  });

  it('sends a text API one prompt in its template, the continued reply left open, with the template’s stops too', () => {
    const body = upstreamBody({ base_url: 'http://h', model: 'm', api_key: '', api: 'text', instruct_template: 'chatml' }, sampler, messages, 'continue');
    expect(body.prompt).toBe('<|im_start|>user\nHi.<|im_end|>\n<|im_start|>assistant\nHel');
    expect(body.stop).toEqual(['END', '<|im_end|>']);
    expect(body).not.toHaveProperty('messages');
  });
});
