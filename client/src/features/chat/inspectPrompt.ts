// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The context inspector's data (A18): what the model would be given for a reply now, read from
 * `POST /api/v1/ai_chat/prompt` (which asks no model and moves no lore timer). And a summary of
 * the branch (A19), from `POST /api/v1/ai_chat/summarize`, which writes nothing.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { z } from 'zod';
import type { ReplyRequest } from './useReply';

export const INSPECT_PATH = '/api/v1/ai_chat/prompt';

export const inspectedSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string(), tokens: z.number() })),
  dropped: z.number(),
  tokens: z.number(),
  context_tokens: z.number(),
  max_tokens: z.number(),
  active_lore: z.array(z.string()),
});
export type InspectedPrompt = z.infer<typeof inspectedSchema>;

export const SUMMARIZE_PATH = '/api/v1/ai_chat/summarize';

const summarySchema = z.object({ text: z.string(), dropped: z.number() });
export type BranchSummary = z.infer<typeof summarySchema>;

/** One of the chat's model actions: `key` read from the answer, or the server's reason thrown. */
async function ask<T>(path: string, request: ReplyRequest, key: string, schema: z.ZodType<T>, what: string): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ generate: request }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail: unknown = Reflect.get(Object(body), 'detail');
    const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
    throw new Error(typeof message === 'string' ? message : `${what} (${response.status})`);
  }
  return schema.parse(Reflect.get(Object(body), key));
}

export function inspectPrompt(request: ReplyRequest): Promise<InspectedPrompt> {
  return ask(INSPECT_PATH, request, 'prompt', inspectedSchema, 'The prompt could not be read');
}

export const PICTURE_PATH = '/api/v1/ai_chat/picture';

/** A picture of the scene up to `leafId` (A30), drawn by a model set to draw; nothing is saved. */
export async function pictureOfScene(chatId: string, leafId: string | null, prompt = ''): Promise<{ prompt: string; image: string }> {
  const response = await fetch(PICTURE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ picture: { chat_id: chatId, leaf_id: leafId, prompt } }),
  });
  const body: unknown = await response.json().catch(() => null);
  const picture: unknown = Reflect.get(Object(body), 'picture');
  const image: unknown = Reflect.get(Object(picture), 'image');
  const asked: unknown = Reflect.get(Object(picture), 'prompt');
  if (!response.ok || typeof image !== 'string' || typeof asked !== 'string') {
    const detail: unknown = Reflect.get(Object(body), 'detail');
    const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
    throw new Error(typeof message === 'string' ? message : `The picture could not be drawn (${response.status})`);
  }
  return { prompt: asked, image };
}

export const TRANSLATE_PATH = '/api/v1/ai_chat/translate';

/** `text` translated into `language` by the chat's model (A43); nothing is saved. */
export async function translateText(chatId: string, text: string, language: string): Promise<string> {
  const response = await fetch(TRANSLATE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ translate: { chat_id: chatId, text, language } }),
  });
  const body: unknown = await response.json().catch(() => null);
  const translated: unknown = Reflect.get(Object(Reflect.get(Object(body), 'translate')), 'text');
  if (!response.ok || typeof translated !== 'string') {
    const detail: unknown = Reflect.get(Object(body), 'detail');
    const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
    throw new Error(typeof message === 'string' ? message : `The translation could not be written (${response.status})`);
  }
  return translated;
}

/** Which of a character's sprites fits a line (A4); null when none does or none exists. */
export async function expressionFor(chatId: string, characterId: string, text: string): Promise<string | null> {
  const response = await fetch('/api/v1/ai_chat/expression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ expression: { chat_id: chatId, character_id: characterId, text } }),
  });
  const body: unknown = await response.json().catch(() => null);
  const label: unknown = Reflect.get(Object(Reflect.get(Object(body), 'expression')), 'label');
  return response.ok && typeof label === 'string' ? label : null;
}

/** This device's language as people name it ("French"), for the model to translate into. */
export function deviceLanguage(locale: string = typeof navigator === 'undefined' ? 'en' : navigator.language): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export function summarizeBranch(request: ReplyRequest): Promise<BranchSummary> {
  return ask(SUMMARIZE_PATH, request, 'summary', summarySchema, 'The summary could not be written');
}
