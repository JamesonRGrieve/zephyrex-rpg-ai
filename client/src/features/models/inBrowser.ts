// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Models that run in the browser (AP6), with WebLLM (MLC) on WebGPU (the operator's choice,
 * 2026-11-20), so lite can work with no model server on a device strong enough for it
 * (`canRunLocalModel`). The library is loaded only when such a model is first asked: it and the
 * model's weights are large, and most devices never need them. One model is kept loaded at a time.
 */
import type { ModelMessage } from '~/features/prompt/assemble';

/** What loading reports, for a progress bar: a share from 0 to 1, and the library's own words. */
export interface LoadProgress {
  share: number;
  text: string;
}

/** The part of WebLLM's engine this app uses: OpenAI-style streamed chat completions. */
export interface InBrowserEngine {
  chat: {
    completions: {
      create(request: {
        messages: ModelMessage[];
        stream: true;
        temperature?: number;
        max_tokens?: number;
      }): Promise<AsyncIterable<{ choices: { delta: { content?: string | null } }[] }>>;
    };
  };
  interruptGenerate(): void;
  unload(): Promise<void>;
}

export type EngineLoader = (model: string, onProgress: (progress: LoadProgress) => void) => Promise<InBrowserEngine>;

/** WebLLM itself, imported on first use. */
export const webLlmLoader: EngineLoader = async (model, onProgress) => {
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
  return CreateMLCEngine(model, {
    initProgressCallback: (report) => onProgress({ share: report.progress, text: report.text }),
  });
};

let current: { model: string; engine: Promise<InBrowserEngine> } | null = null;

/** The engine for `model`, loading it (and unloading any other) when it isn't the one loaded. */
export async function engineFor(
  model: string,
  onProgress: (progress: LoadProgress) => void,
  load: EngineLoader = webLlmLoader,
): Promise<InBrowserEngine> {
  if (current?.model === model) return current.engine;
  const previous = current;
  const engine = (async () => {
    if (previous !== null) await (await previous.engine.catch(() => null))?.unload();
    return load(model, onProgress);
  })();
  current = { model, engine };
  // A load that fails is forgotten, so the next ask tries again rather than reusing the failure.
  engine.catch(() => {
    if (current?.engine === engine) current = null;
  });
  return engine;
}

/** Forgets the loaded engine (tests). */
export function resetEngines(): void {
  current = null;
}

/**
 * A reply from an in-browser model, piece by piece, as a server's stream would give it. Stopping
 * (`signal`) interrupts the model where it is.
 */
export async function* inBrowserReply(
  model: string,
  messages: ModelMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    onProgress?: (progress: LoadProgress) => void;
    load?: EngineLoader;
  } = {},
): AsyncGenerator<string> {
  const engine = await engineFor(model, options.onProgress ?? (() => undefined), options.load);
  const stop = () => engine.interruptGenerate();
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });
    for await (const chunk of chunks) {
      if (options.signal?.aborted === true) return;
      const piece = chunk.choices[0]?.delta.content ?? '';
      if (piece !== '') yield piece;
    }
  } finally {
    options.signal?.removeEventListener('abort', stop);
  }
}
