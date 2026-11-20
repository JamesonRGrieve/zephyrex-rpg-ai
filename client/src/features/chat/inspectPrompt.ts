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

export function summarizeBranch(request: ReplyRequest): Promise<BranchSummary> {
  return ask(SUMMARIZE_PATH, request, 'summary', summarySchema, 'The summary could not be written');
}
