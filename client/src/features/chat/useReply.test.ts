// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATE_PATH, TURN_PATH, TURN_STOP_PATH, TURN_STREAM_PATH, useReply } from './useReply';

const sse = (...blocks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const b of blocks) c.enqueue(new TextEncoder().encode(`${b}\n\n`));
        c.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );

afterEach(() => vi.unstubAllGlobals());

describe('useReply', () => {
  it('posts the turn (204), then follows its stream, taken again from the start when it drops', async () => {
    const calls: string[] = [];
    let follows = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url.split('?')[0] ?? url);
        if (url === TURN_PATH) return new Response(null, { status: 204 });
        follows += 1;
        // The first subscription drops mid-reply; the second replays the whole turn to its end.
        return follows === 1
          ? sse('event: delta\ndata: {"text":"Rain "}')
          : sse(
              'event: delta\ndata: {"text":"Rain "}',
              'event: delta\ndata: {"text":"falls."}',
              ': keepalive',
              'event: done\ndata: {"dropped":0}',
            );
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useReply());
    let reply: Awaited<ReturnType<typeof result.current.write>> = null;
    await act(async () => {
      reply = await result.current.write({ chat_id: 'c1', leaf_id: null, speaker_id: null });
    });
    vi.useRealTimers();
    expect(calls).toEqual([TURN_PATH, TURN_STREAM_PATH, TURN_STREAM_PATH]);
    expect(reply).toMatchObject({ text: 'Rain falls.', stopped: false });
  });

  it('streams directly where the server has no turns (lite, an older build)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === TURN_PATH) return new Response(null, { status: 404 });
        return sse('event: delta\ndata: {"text":"Hello."}', 'event: done\ndata: {"dropped":0}');
      }),
    );
    const { result } = renderHook(() => useReply());
    let reply: Awaited<ReturnType<typeof result.current.write>> = null;
    await act(async () => {
      reply = await result.current.write({ chat_id: 'c1', leaf_id: null, speaker_id: null });
    });
    expect(calls).toEqual([TURN_PATH, GENERATE_PATH]);
    expect(reply).toMatchObject({ text: 'Hello.' });
  });

  it('stops the server turn by its own request', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url.split('?')[0] ?? url);
        if (url === TURN_PATH) return new Response(null, { status: 204 });
        if (url === TURN_STOP_PATH) return new Response(JSON.stringify({ turn_stop: { stopped: true } }), { status: 200 });
        // A stream that never ends until it is aborted.
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"Once"}\n\n'));
              init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
            },
          }),
          { status: 200 },
        );
      }),
    );
    const { result } = renderHook(() => useReply());
    let pending: ReturnType<typeof result.current.write> | undefined;
    act(() => {
      pending = result.current.write({ chat_id: 'c1', leaf_id: null, speaker_id: null });
    });
    await vi.waitFor(() => expect(calls).toContain(TURN_STREAM_PATH));
    act(() => result.current.stop());
    const reply = await act(async () => pending);
    expect(calls).toContain(TURN_STOP_PATH);
    expect(reply).toMatchObject({ text: 'Once', stopped: true });
  });
});
