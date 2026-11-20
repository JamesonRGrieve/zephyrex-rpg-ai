// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading an OpenAI-compatible streamed chat completion (`stream: true`): server-sent events whose
 * `data:` lines carry `choices[0].delta.content`, ending with `data: [DONE]`. Ollama, llama.cpp,
 * vLLM, Bifrost and the hosted APIs all answer this way. A streamed text completion's lines carry
 * `choices[0].text` instead, and are read the same way.
 */

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
  const content: unknown = Reflect.get(Object(Reflect.get(Object(choice), 'delta')), 'content') ?? Reflect.get(Object(choice), 'text');
  return typeof content === 'string' && content !== '' ? content : null;
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
async function* pump(reader: ReadableStreamDefaultReader<string>, carried: string): AsyncGenerator<string> {
  const { done, value } = await reader.read();
  const { payloads, rest } = takeDataLines(carried + (done ? '\n' : value));
  const end = payloads.findIndex(isDone);
  for (const payload of end === -1 ? payloads : payloads.slice(0, end)) {
    const delta = deltaOf(payload);
    if (delta !== null) yield delta;
  }
  if (end !== -1) await reader.cancel();
  else if (!done) yield* pump(reader, rest);
}

/** The text deltas of a streamed completion body, in order, until `[DONE]` or the end. */
export function completionDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  return pump(body.pipeThrough(new TextDecoderStream()).getReader(), '');
}
