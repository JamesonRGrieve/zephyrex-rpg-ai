// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../contract/prompt-cases.json';
import { completionDeltas, deltaOf, isDone, reasoningJoiner, takeDataLines } from './completionStream';

const chunk = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of completionDeltas(stream)) out.push(delta);
  return out;
}

describe('completion stream', () => {
  it('reads the delta text, and nothing from role-only, keep-alive or broken payloads', () => {
    expect(deltaOf(` ${chunk('Hi')}`)).toBe('Hi');
    expect(deltaOf(JSON.stringify({ choices: [{ text: 'Hey' }] }))).toBe('Hey');
    expect(deltaOf(JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }))).toBeNull();
    expect(deltaOf('')).toBeNull();
    expect(deltaOf('{not json')).toBeNull();
    expect(deltaOf(' [DONE]')).toBeNull();
    expect(isDone(' [DONE]')).toBe(true);
  });

  it('keeps a partial line for the next chunk', () => {
    expect(takeDataLines('data: a\n: comment\ndata: b\r\ndata: par')).toEqual({ payloads: [' a', ' b'], rest: 'data: par' });
  });

  it('yields every delta across split chunks, and stops at [DONE]', async () => {
    const body = `data: ${chunk('Hel')}\n\ndata: ${chunk('lo')}\n\ndata: [DONE]\n\ndata: ${chunk('ignored')}\n\n`;
    const split = [body.slice(0, 17), body.slice(17, 50), body.slice(50)];
    expect(await collect(streamOf(split))).toEqual(['Hel', 'lo']);
  });

  it('keeps a character whole when its bytes are split across chunks', async () => {
    const bytes = new TextEncoder().encode(`data: ${chunk('“Mind”')}\n\ndata: [DONE]\n\n`);
    const cut = bytes.indexOf(0xe2) + 1; // inside the three bytes of “
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual(['“Mind”']);
  });

  it('finishes a stream that ends without [DONE]', async () => {
    expect(await collect(streamOf([`data: ${chunk('end')}`]))).toEqual(['end']);
  });
});

describe('reasoning streamed apart (A45; contract/prompt-cases.json stream_cases)', () => {
  it.each(cases.stream_cases)('$name', ({ payloads, text }) => {
    const joiner = reasoningJoiner();
    expect(payloads.map((payload) => joiner.take(payload) ?? '').join('') + (joiner.end() ?? '')).toBe(text);
  });

  it('closes the reasoning a stream ended inside', async () => {
    const thinking = JSON.stringify({ choices: [{ delta: { reasoning_content: 'Hm.' } }] });
    expect((await collect(streamOf([`data: ${thinking}\n\ndata: [DONE]\n\n`]))).join('')).toBe('<think>Hm.</think>');
  });
});
