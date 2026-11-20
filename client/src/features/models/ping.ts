// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/** A model's check (A28), from `POST /api/v1/ai_chat/ping`. */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { z } from 'zod';

export const pingSchema = z.object({ ok: z.boolean(), latency_ms: z.number(), status: z.number().nullable(), has_model: z.boolean().nullable(), detail: z.string() });
export type PingResult = z.infer<typeof pingSchema>;

export async function pingEndpoint(endpointId: string): Promise<PingResult> {
  const response = await fetch('/api/v1/ai_chat/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ ping: { endpoint_id: endpointId } }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`The check could not run (${response.status})`);
  return pingSchema.parse(Reflect.get(Object(body), 'ping'));
}
