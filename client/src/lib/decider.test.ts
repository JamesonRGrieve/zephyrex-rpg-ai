// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askDecider, completionContent, decideTimeoutMs } from './decider';

// Asking a model needs no records: the records layer (Prisma) is stubbed out.
vi.mock('~/lib/rpgRecords', () => ({ endpoints: {} }));

const ROW = { baseUrl: 'http://gateway.test/v1/', model: '3-5gb/d1-2b', apiKey: 'k', isDefault: true, name: 'decide' };
const QUESTIONS = {
  expression: { type: 'choice', instructions: 'Which feeling fits?', criteria: ['angry', 'calm'] },
} as const;

function completion(content: string): Response {
  return Response.json({ choices: [{ message: { role: 'assistant', content } }] });
}

afterEach(() => vi.unstubAllGlobals());

describe('completionContent', () => {
  it('reads the first choice, and nothing from a body that is not a completion', () => {
    expect(completionContent({ choices: [{ message: { content: '{}' } }] })).toBe('{}');
    expect(completionContent({ choices: [] })).toBeNull();
    expect(completionContent('nope')).toBeNull();
  });
});

describe('askDecider', () => {
  it('asks once, with the protocol body, and reads only answers among the options', async () => {
    const fetchMock = vi.fn(async () =>
      completion(JSON.stringify({ answers: { expression: { type: 'choice', choice: 'angry', probabilities: { angry: 0.9 } } } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const answers = await askDecider(ROW, 'I will tear you apart', QUESTIONS);
    expect(answers).toEqual({ expression: { choice: 'angry', probability: 0.9 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://gateway.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const sent = JSON.parse(String(init.body)) as { model: string; messages: { content: string }[] };
    expect(sent.model).toBe('3-5gb/d1-2b');
    expect(JSON.parse(sent.messages[0]?.content ?? '')).toMatchObject({ state: 'I will tear you apart' });
  });

  it('gives null when the model cannot be reached or refuses, so the caller falls back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    expect(await askDecider(ROW, 'x', QUESTIONS)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    expect(await askDecider(ROW, 'x', QUESTIONS)).toBeNull();
  });

  it('refuses a choice outside the options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => completion('{"answers": {"expression": {"type": "choice", "choice": "smug"}}}')));
    expect(await askDecider(ROW, 'x', QUESTIONS)).toEqual({ expression: null });
  });
});

describe('a request sized to its questions (Zephyrex RPG, 2026-11-23: a flat 8 s expired every 20-question call)', () => {
  it('waits a base and a share per question', () => {
    expect(decideTimeoutMs({})).toBe(8000);
    expect(decideTimeoutMs({ a: 1, b: 2 })).toBe(16000);
  });
});
