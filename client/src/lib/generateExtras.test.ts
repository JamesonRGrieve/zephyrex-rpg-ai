// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A reply's request and what it keeps (audit gaps 1 and 2): the further samplers reach only the APIs
 * that take them, and the variables a reply's macros set are kept on the chat without making its
 * version stale.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_OWNER_ID } from '@zephyrex/lite';
import { prisma } from '~/lib/prisma';
import { saveVariables, upstreamBody } from './generate';

const sampler = {
  temperature: 0.7,
  top_p: 1,
  top_k: 0,
  repetition_penalty: 1,
  max_tokens: 100,
  context_tokens: 2048,
  stop: [],
  prompt_layout: [],
  samplers: { min_p: 0.05, presence_penalty: 0.4, dry_base: 2, seed: 7 },
};
const messages = [{ role: 'user' as const, content: 'Hi.' }];
const endpoint = (api: 'chat' | 'text') => ({
  base_url: 'http://h',
  model: 'm',
  api_key: '',
  api,
  instruct_template: 'chatml' as const,
});

describe('a preset’s further samplers in the request (audit gap 2)', () => {
  it('sends a chat API only the ones it takes, and a text API every one, under each name', () => {
    const chat = upstreamBody(endpoint('chat'), sampler, messages, 'reply');
    // min_p reaches a chat API too (vLLM, llama.cpp and ollama read it): the runaway fix, 2026-11-22.
    expect(chat).toMatchObject({ min_p: 0.05, presence_penalty: 0.4, seed: 7 });
    expect(chat).not.toHaveProperty('dry_multiplier');
    const text = upstreamBody(endpoint('text'), sampler, messages, 'reply');
    expect(text).toMatchObject({ min_p: 0.05, presence_penalty: 0.4, seed: 7 });
    // DRY's base never goes without its multiplier.
    expect(text).not.toHaveProperty('dry_base');
  });
});

describe('the variables a reply keeps (audit gap 1)', () => {
  beforeEach(async () => {
    await prisma.chat.deleteMany();
  });

  it('writes them only when they changed, and leaves the chat’s version alone', async () => {
    const version = new Date('2026-11-21T00:00:00Z');
    await prisma.chat.create({
      data: { id: 'chat-v', createdById: LOCAL_OWNER_ID, title: 'Chat', variables: '{"mood":"grim"}', updatedAt: version },
    });
    await saveVariables(LOCAL_OWNER_ID, 'chat-v', { mood: 'grim' }, { mood: 'grim' });
    await saveVariables(LOCAL_OWNER_ID, 'chat-v', { mood: 'grim' }, { mood: 'grim', seen: 'yes' });
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: 'chat-v' } });
    expect(JSON.parse(row.variables)).toEqual({ mood: 'grim', seen: 'yes' });
    expect(row.updatedAt).toEqual(version);
    // Another person's chat is never written.
    await saveVariables('someone-else', 'chat-v', {}, { stolen: 'yes' });
    expect(JSON.parse((await prisma.chat.findUniqueOrThrow({ where: { id: 'chat-v' } })).variables)).toEqual({
      mood: 'grim',
      seen: 'yes',
    });
  });
});
