// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading an OpenAI-compatible streamed chat completion (`stream: true`): server-sent events whose
 * `data:` lines carry `choices[0].delta.content`, ending with `data: [DONE]`. Ollama, llama.cpp,
 * vLLM, Bifrost and the hosted APIs all answer this way. A streamed text completion's lines carry
 * `choices[0].text` instead, and are read the same way.
 */

import { REASONING } from '~/contract';

const DATA_PREFIX = 'data:';
const DONE = '[DONE]';

/** The text a `data:` payload adds, or null when it adds none (role-only, empty, keep-alive). */
export function deltaOf(payload: string): string | null {
  const body = payload.trim();
  if (body === '' || body === DONE) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const choice: unknown = Reflect.get(Object(Reflect.get(Object(parsed), 'choices')), 0);
  const content: unknown =
    Reflect.get(Object(Reflect.get(Object(choice), 'delta')), 'content') ?? Reflect.get(Object(choice), 'text');
  return typeof content === 'string' && content !== '' ? content : null;
}

/** What one `data:` payload carries: answer text, and reasoning a model streams apart (A45). */
export function piecesOf(payload: string): { reasoning: string; content: string } {
  const body = payload.trim();
  if (body === '' || body === DONE) return { reasoning: '', content: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { reasoning: '', content: '' };
  }
  const choice: unknown = Reflect.get(Object(Reflect.get(Object(parsed), 'choices')), 0);
  const delta: unknown = Reflect.get(Object(choice), 'delta');
  // DeepSeek, llama.cpp and vLLM name it reasoning_content; OpenRouter, reasoning.
  const reasoning: unknown = Reflect.get(Object(delta), 'reasoning_content') ?? Reflect.get(Object(delta), 'reasoning');
  const content = deltaOf(payload);
  return { reasoning: typeof reasoning === 'string' ? reasoning : '', content: content ?? '' };
}

/**
 * Folds reasoning a model streams apart (A45) into the text as the contract's first reasoning pair
 * (`<think>…</think>`), so the reply is read, stored and split like any other reasoning. `take`
 * answers what a payload adds; `end` closes a pair the stream left open.
 */
export function reasoningJoiner(): { take: (payload: string) => string | null; end: () => string | null } {
  const [open, close] = REASONING.pairs[0] as [string, string];
  let inside = false;
  return {
    take(payload) {
      const { reasoning, content } = piecesOf(payload);
      let out = '';
      if (reasoning !== '') {
        if (!inside) out += open;
        inside = true;
        out += reasoning;
      }
      if (content !== '') {
        if (inside) out += close;
        inside = false;
        out += content;
      }
      return out === '' ? null : out;
    },
    end() {
      if (!inside) return null;
      inside = false;
      return close;
    },
  };
}

/**
 * Splits streamed text into complete lines, keeping a partial last line for the next chunk.
 * Returns the `data:` payloads finished so far and what is left over.
 */
export function takeDataLines(buffer: string): { payloads: string[]; rest: string } {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';
  const payloads = lines.filter((line) => line.startsWith(DATA_PREFIX)).map((line) => line.slice(DATA_PREFIX.length));
  return { payloads, rest };
}

/** Whether a payload is the stream's end marker. */
export function isDone(payload: string): boolean {
  return payload.trim() === DONE;
}

/** The deltas in the stream from here on: one chunk at a time, carrying any partial line over. */
async function* pump(
  reader: ReadableStreamDefaultReader<string>,
  carried: string,
  joiner: ReturnType<typeof reasoningJoiner>,
): AsyncGenerator<string> {
  const { done, value } = await reader.read();
  const { payloads, rest } = takeDataLines(carried + (done ? '\n' : value));
  const end = payloads.findIndex(isDone);
  for (const payload of end === -1 ? payloads : payloads.slice(0, end)) {
    const delta = joiner.take(payload);
    if (delta !== null) yield delta;
  }
  if (end !== -1 || done) {
    const closing = joiner.end();
    if (closing !== null) yield closing;
    if (end !== -1) await reader.cancel();
    return;
  }
  yield* pump(reader, rest, joiner);
}

/** The text deltas of a streamed completion body, in order, until `[DONE]` or the end. */
export function completionDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  // TextDecoder takes any buffer (a fetch body's chunks are typed ArrayBufferLike, which
  // TextDecoderStream's types refuse); `stream: true` keeps a character split across chunks whole.
  const decoder = new TextDecoder();
  const text = body.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        controller.enqueue(decoder.decode(chunk, { stream: true }));
      },
      flush(controller) {
        const rest = decoder.decode();
        if (rest !== '') controller.enqueue(rest);
      },
    }),
  );
  return pump(text.getReader(), '', reasoningJoiner());
}
