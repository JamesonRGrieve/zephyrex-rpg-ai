// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Native APIs (audit gap 8): Anthropic's Messages API (Claude) and Google's Gemini API, asked from the
 * same OpenAI-shaped chat body an OpenAI-compatible endpoint gets, and read back as its stream. Pure,
 * and held to contract/native-api-cases.json, which the SaaS server's NativeApis.py runs too.
 *
 * - **Request:** the leading system messages become the API's own system text; a later one becomes
 *   the person's turn (neither API takes a system turn in the chat); turns of the same role in a row
 *   are joined; a conversation that doesn't open on the person's turn gets the contract's opening.
 *   Temperature, top-P, top-K, the reply's length and stop strings carry over; nothing else does,
 *   since both refuse fields they don't know. A last assistant turn is the reply's start (prefill).
 * - **Stream:** each server-sent `data:` payload becomes an OpenAI chunk
 *   (`choices[0].delta.content`, and `reasoning_content` for a model's thinking), so one reader takes
 *   every API.
 */
import { NATIVE_APIS } from '~/contract';

export type NativeApi = 'anthropic' | 'google';

export interface NativeRequest {
  url: string;
  headers: Record<string, string>;
  json: Record<string, unknown>;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const field = (value: unknown, name: string | number): unknown => Reflect.get(Object(value), name);
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The system text and the alternating turns both APIs want. */
export function turnsOf(messages: readonly unknown[]): { system: string; turns: Turn[] } {
  const system: string[] = [];
  const turns: Turn[] = [];
  let leading = true;
  for (const message of messages) {
    const role = field(message, 'role');
    const raw = field(message, 'content');
    const content = typeof raw === 'string' ? raw : '';
    if (role === 'system' && leading) {
      if (content.trim() !== '') system.push(content);
      continue;
    }
    leading = false;
    const as: Turn['role'] = role === 'assistant' ? 'assistant' : 'user';
    const last = turns.at(-1);
    if (last !== undefined && last.role === as) last.content = `${last.content}\n\n${content}`;
    else turns.push({ role: as, content });
  }
  if (turns[0]?.role !== 'user') turns.unshift({ role: 'user', content: NATIVE_APIS.opening });
  return { system: system.join('\n\n'), turns };
}

/** An endpoint's base URL without an OpenAI path or a trailing slash. */
export const baseOf = (baseUrl: string): string => baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '');

/** The request for `api`, from an OpenAI-shaped chat body. */
export function nativeRequest(
  api: NativeApi,
  baseUrl: string,
  apiKey: string,
  body: Readonly<Record<string, unknown>>,
): NativeRequest {
  const { system, turns } = turnsOf(Array.isArray(body.messages) ? body.messages : []);
  const temperature = number(body.temperature);
  const topP = number(body.top_p);
  const topK = number(body.top_k);
  const maxTokens = number(body.max_tokens);
  const stop = Array.isArray(body.stop) ? body.stop.filter((item): item is string => typeof item === 'string') : [];
  const model = typeof body.model === 'string' ? body.model : '';
  if (api === 'anthropic') {
    return {
      url: `${baseOf(baseUrl)}/messages`,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': NATIVE_APIS.anthropic_version,
        ...(apiKey === '' ? {} : { 'x-api-key': apiKey }),
      },
      json: {
        model,
        ...(system === '' ? {} : { system }),
        messages: turns,
        max_tokens: maxTokens ?? 1024,
        stream: true,
        ...(temperature === undefined ? {} : { temperature: Math.min(NATIVE_APIS.anthropic_temperature_max, temperature) }),
        ...(topP === undefined || topP >= 1 ? {} : { top_p: topP }),
        ...(topK === undefined || topK <= 0 ? {} : { top_k: topK }),
        ...(stop.length === 0 ? {} : { stop_sequences: stop }),
      },
    };
  }
  return {
    url: `${baseOf(baseUrl)}/models/${model}:streamGenerateContent?alt=sse`,
    headers: { 'Content-Type': 'application/json', ...(apiKey === '' ? {} : { 'x-goog-api-key': apiKey }) },
    json: {
      ...(system === '' ? {} : { systemInstruction: { parts: [{ text: system }] } }),
      contents: turns.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      generationConfig: {
        ...(temperature === undefined ? {} : { temperature }),
        ...(topP === undefined ? {} : { topP }),
        ...(topK === undefined || topK <= 0 ? {} : { topK }),
        ...(maxTokens === undefined ? {} : { maxOutputTokens: maxTokens }),
        ...(stop.length === 0 ? {} : { stopSequences: stop }),
      },
    },
  };
}

/** One of the API's stream payloads as an OpenAI chunk's delta, or null when it adds nothing. */
export function nativeDelta(api: NativeApi, payload: string): { content?: string; reasoning_content?: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.trim());
  } catch {
    return null;
  }
  if (api === 'anthropic') {
    if (field(parsed, 'type') !== 'content_block_delta') return null;
    const delta = field(parsed, 'delta');
    const text = field(delta, 'text');
    const thinking = field(delta, 'thinking');
    if (typeof text === 'string' && text !== '') return { content: text };
    if (typeof thinking === 'string' && thinking !== '') return { reasoning_content: thinking };
    return null;
  }
  const parts = field(field(field(field(parsed, 'candidates'), 0), 'content'), 'parts');
  if (!Array.isArray(parts)) return null;
  let content = '';
  let reasoning = '';
  for (const part of parts) {
    const text = field(part, 'text');
    if (typeof text !== 'string') continue;
    if (field(part, 'thought') === true) reasoning += text;
    else content += text;
  }
  if (content === '' && reasoning === '') return null;
  return { ...(content === '' ? {} : { content }), ...(reasoning === '' ? {} : { reasoning_content: reasoning }) };
}

/** The payload as an OpenAI chunk's JSON, for the one stream reader; null when it adds nothing. */
export function openAiPayload(api: NativeApi, payload: string): string | null {
  const delta = nativeDelta(api, payload);
  return delta === null ? null : JSON.stringify({ choices: [{ delta }] });
}

export const isNativeApi = (api: string): api is NativeApi => api === 'anthropic' || api === 'google';

/** Where `api` lists its models, and the headers it wants (the model check, A28). */
export function nativeModelsRequest(
  api: NativeApi,
  baseUrl: string,
  apiKey: string,
): { url: string; headers: Record<string, string> } {
  if (api === 'anthropic') {
    return {
      url: `${baseOf(baseUrl)}/models`,
      headers: { 'anthropic-version': NATIVE_APIS.anthropic_version, ...(apiKey === '' ? {} : { 'x-api-key': apiKey }) },
    };
  }
  return { url: `${baseOf(baseUrl)}/models`, headers: apiKey === '' ? {} : { 'x-goog-api-key': apiKey } };
}

/** The model names in `api`'s model list (Gemini's without their `models/` prefix); null when it isn't one. */
export function nativeModelIds(api: NativeApi, answer: unknown): string[] | null {
  const listed = field(answer, api === 'anthropic' ? 'data' : 'models');
  if (!Array.isArray(listed)) return null;
  return listed.flatMap((model) => {
    const id = field(model, api === 'anthropic' ? 'id' : 'name');
    return typeof id === 'string' ? [id.replace(/^models\//, '')] : [];
  });
}
