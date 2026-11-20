// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The context inspector's data (A18): what the model would be given for a reply now, read from
 * `POST /api/v1/ai_chat/prompt` (which asks no model and moves no lore timer).
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

export async function inspectPrompt(request: ReplyRequest): Promise<InspectedPrompt> {
  const response = await fetch(INSPECT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ generate: request }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail: unknown = Reflect.get(Object(body), 'detail');
    const message: unknown = typeof detail === 'string' ? detail : Reflect.get(Object(detail), 'message');
    throw new Error(typeof message === 'string' ? message : `The prompt could not be read (${response.status})`);
  }
  return inspectedSchema.parse(Reflect.get(Object(body), 'prompt'));
}
