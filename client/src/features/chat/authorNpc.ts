// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The GM authors an NPC the story needs (the operator, 2026-11-22: "when I walk up to the barkeeper,
 * since an npc for that doesn't exist, it should author one as a pre-step… In chat should show a
 * progress bar with "authoring new NPC (barkeeper)" and then proceed normally"). The decision model
 * says whether the person's latest line needs one (npc_needed); the server writes them, makes them a
 * person of the campaign, builds their sheet from the compendium and paints a portrait when it can
 * (author_npc), reporting each step.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';
import { takeBlocks } from './replyStream';

export interface NpcNeeded {
  name: string;
  role: string;
}

/** A figure the line meets who is one of the campaign's people already (the hooded woman is Ysolde). */
export interface NpcMatched {
  matched: { id: string; name: string };
}

export interface AuthoringStep {
  label: string;
  done: number;
  total: number;
}

/** Whether the person's latest line needs a new NPC: who, or null (none, or any failure). */
export async function npcNeeded(chatId: string, leafId: string): Promise<NpcNeeded | NpcMatched | null> {
  const response = await fetch('/api/v1/ai_chat/npc_needed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ npc_needed: { chat_id: chatId, leaf_id: leafId } }),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const answer = Object(Reflect.get(Object(await response.json().catch(() => null)), 'npc_needed'));
  const name = Reflect.get(answer, 'name');
  // Matched to someone the campaign already has (Parity's npc_needed match): they join the cast, no one is
  // authored (the operator, 2026-11-23: "The hooded woman should already have been an NPC").
  const matchedId = Reflect.get(answer, 'matched_id');
  const matchedName = Reflect.get(answer, 'matched_name');
  if (typeof matchedId === 'string' && matchedId !== '')
    return { matched: { id: matchedId, name: typeof matchedName === 'string' ? matchedName : '' } };
  if (Reflect.get(answer, 'needed') !== true || typeof name !== 'string' || name === '') return null;
  const role = Reflect.get(answer, 'role');
  return { name, role: typeof role === 'string' ? role : '' };
}

/** One event block of the authoring stream; null for a heartbeat or anything else. */
export function authoringEvent(
  block: string,
): { type: 'step'; step: AuthoringStep } | { type: 'done'; personId: string } | { type: 'error'; message: string } | null {
  let name = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  let body: unknown;
  try {
    body = JSON.parse(data.join('\n'));
  } catch {
    return null;
  }
  const field = (key: string): unknown => Reflect.get(Object(body), key);
  if (name === 'step' && typeof field('label') === 'string')
    return {
      type: 'step',
      step: { label: field('label') as string, done: Number(field('done') ?? 0), total: Number(field('total') ?? 0) },
    };
  if (name === 'done' && typeof field('person_id') === 'string')
    return { type: 'done', personId: field('person_id') as string };
  if (name === 'error')
    return { type: 'error', message: String(field('message') ?? field('detail') ?? 'The NPC was not authored') };
  return null;
}

/** Authors the NPC, reporting each step; their person id, or null when it failed. */
export async function authorNpc(
  chatId: string,
  leafId: string,
  npc: NpcNeeded,
  onStep: (step: AuthoringStep) => void,
): Promise<string | null> {
  const response = await fetch('/api/v1/ai_chat/author_npc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ author_npc: { chat_id: chatId, leaf_id: leafId, name: npc.name, role: npc.role } }),
  }).catch(() => null);
  if (response === null || !response.ok || response.body === null) return null;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return null;
    buffer += value;
    const { blocks, rest } = takeBlocks(buffer);
    buffer = rest;
    for (const block of blocks) {
      const event = authoringEvent(block);
      if (event?.type === 'step') onStep(event.step);
      else if (event?.type === 'done') return event.personId;
      else if (event?.type === 'error') return null;
    }
  }
}
