// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Server voices (A29), lite twin: the shared case file, then the route end to end against a real
 * local HTTP server answering as an OpenAI-compatible `/audio/speech` does.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import cases from '../../../contract/speech-cases.json';
import { SPEECH } from '~/contract';
import { prisma } from '~/lib/prisma';
import { audioType, speech, speechBody, speechUrl } from './speech';

describe('the speech cases both twins run', () => {
  it.each(cases.url_cases)('$name', ({ base_url: baseUrl, url }) => {
    expect(speechUrl(baseUrl)).toBe(url);
  });
  it.each(cases.body_cases)('$name', ({ model, speech: asked, body }) => {
    expect(speechBody(model, asked)).toEqual(body);
  });
  it.each(cases.audio_type_cases)('$name', ({ content_type: contentType, audio_type: expected }) => {
    expect(audioType(contentType)).toBe(expected);
  });
});

interface Received {
  path: string;
  authorization: string | undefined;
  body: unknown;
}

let server: Server;
let baseUrl = '';
const received: Received[] = [];
let answer: 'audio' | 'json' | 'refuse' = 'audio';

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        path: request.url ?? '',
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      });
      if (answer === 'refuse') response.writeHead(401).end('{"error":"bad key"}');
      else if (answer === 'json') response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      else response.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(Buffer.from('ID3'));
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
  answer = 'audio';
  await prisma.modelEndpoint.deleteMany();
});

const stamp = () => ({ createdById: LOCAL_OWNER_ID, updatedAt: new Date() });

function call(body: unknown) {
  return new NextRequest('http://localhost/api/v1/ai_chat/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/ai_chat/speech (A29)', () => {
  const asked = { speech: { text: 'Mind the coolant.', voice: 'af_bella', speed: 1.5 } };

  it('is spoken only by a model set to speak', async () => {
    await prisma.modelEndpoint.create({
      data: { ...stamp(), name: 'Local', baseUrl, model: 'tiny', isDefault: true },
    });
    const refused = await speech(call(asked));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ detail: { code: 'no_voice_model' } });
    expect(received).toHaveLength(0);

    await prisma.modelEndpoint.create({
      data: { ...stamp(), name: 'Voices', baseUrl, model: 'kokoro', apiKey: 'k-9', roles: '["voice"]' },
    });
    const spoken = await speech(call(asked));
    expect(spoken.status).toBe(200);
    expect(await spoken.json()).toEqual({ speech: { audio: 'data:audio/mpeg;base64,SUQz' } });
    expect(received.at(-1)).toEqual({
      path: '/v1/audio/speech',
      authorization: 'Bearer k-9',
      body: { model: 'kokoro', input: 'Mind the coolant.', voice: 'af_bella', speed: 1.5, response_format: 'mp3' },
    });
  });

  it('refuses a bad request, and a model that fails or sends no audio', async () => {
    await prisma.modelEndpoint.create({
      data: { ...stamp(), name: 'Voices', baseUrl, model: 'kokoro', roles: '["voice"]' },
    });
    for (const bad of [
      { text: '   ' },
      { text: 'x'.repeat(SPEECH.text_characters + 1) },
      { text: 'Hi.', speed: 9 },
      { text: 'Hi.', voice: '' },
    ]) {
      expect((await speech(call({ speech: bad }))).status).toBe(422);
    }
    answer = 'refuse';
    expect(await (await speech(call(asked))).json()).toMatchObject({ detail: { code: 'model_refused' } });
    answer = 'json';
    const silent = await speech(call(asked));
    expect(silent.status).toBe(502);
    expect(await silent.json()).toMatchObject({ detail: { code: 'model_refused' } });
  });
});
