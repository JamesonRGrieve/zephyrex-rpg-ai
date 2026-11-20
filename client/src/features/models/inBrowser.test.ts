// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EngineLoader, type InBrowserEngine, engineFor, inBrowserReply, resetEngines } from './inBrowser';

function fakeEngine(pieces: string[]): InBrowserEngine & { unload: ReturnType<typeof vi.fn> } {
  let interrupted = false;
  return {
    chat: {
      completions: {
        create: vi.fn(async () =>
          (async function* () {
            for (const piece of pieces) {
              if (interrupted) return;
              yield { choices: [{ delta: { content: piece } }] };
            }
          })(),
        ),
      },
    },
    interruptGenerate: () => {
      interrupted = true;
    },
    unload: vi.fn(async () => undefined),
  };
}

afterEach(() => resetEngines());

const collect = async (stream: AsyncIterable<string>): Promise<string[]> => {
  const out: string[] = [];
  for await (const piece of stream) out.push(piece);
  return out;
};

describe('engineFor', () => {
  it('loads a model once, and unloads it before loading another', async () => {
    const first = fakeEngine([]);
    const second = fakeEngine([]);
    const load = vi.fn<EngineLoader>(async (model) => (model === 'a' ? first : second));
    await engineFor('a', () => undefined, load);
    await engineFor('a', () => undefined, load);
    expect(load).toHaveBeenCalledTimes(1);
    await engineFor('b', () => undefined, load);
    expect(first.unload).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forgets a load that failed, so the next ask tries again', async () => {
    const load = vi.fn<EngineLoader>(async () => {
      throw new Error('no WebGPU');
    });
    await expect(engineFor('a', () => undefined, load)).rejects.toThrow('no WebGPU');
    await expect(engineFor('a', () => undefined, load)).rejects.toThrow('no WebGPU');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('passes loading progress on', async () => {
    const seen: number[] = [];
    await engineFor(
      'a',
      (progress) => seen.push(progress.share),
      async (_model, onProgress) => {
        onProgress({ share: 0.5, text: 'Fetching' });
        return fakeEngine([]);
      },
    );
    expect(seen).toEqual([0.5]);
  });
});

describe('inBrowserReply', () => {
  it('streams the reply in pieces, skipping empty ones', async () => {
    const engine = fakeEngine(['Hel', '', 'lo']);
    const pieces = await collect(
      inBrowserReply('a', [{ role: 'user', content: 'Hi' }], { load: async () => engine, maxTokens: 20 }),
    );
    expect(pieces).toEqual(['Hel', 'lo']);
    expect(engine.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({ stream: true, max_tokens: 20 }));
  });

  it('stops where it is when asked to', async () => {
    const stop = new AbortController();
    const engine = fakeEngine(['one', 'two', 'three']);
    const pieces: string[] = [];
    for await (const piece of inBrowserReply('a', [], { load: async () => engine, signal: stop.signal })) {
      pieces.push(piece);
      stop.abort();
    }
    expect(pieces).toEqual(['one']);
  });
});
