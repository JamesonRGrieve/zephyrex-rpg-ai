// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map follows the story (the operator, 2026-11-21: "The GM needs to update the map based on what
 * I say in narrative mode"): after a round, the server's map step lets the decision model move tokens
 * and change the scene, choosing only from the scene's tokens and the campaign's scenes, applied
 * through the VTT. Every 6 rounds the world ticks too, so the cast follows their routines.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';

export interface MapChange {
  moved: { person: string; place: string }[];
  scene: string | null;
}

async function step(path: string, envelope: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`/api/v1/ai_chat/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ [envelope]: body }),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  return Reflect.get(Object(await response.json().catch(() => null)), envelope) ?? null;
}

/** Moves the map after the round ending at `leafId`: who went where, or null when nobody moved. */
export async function mapStep(chatId: string, leafId: string): Promise<MapChange | null> {
  const answer = Object(await step('map_step', 'map_step', { chat_id: chatId, leaf_id: leafId })) as Record<string, unknown>;
  const moves = Array.isArray(answer.moves) ? answer.moves : [];
  const moved = moves.flatMap((move) => {
    const person = Reflect.get(Object(move), 'person_id');
    const place = Reflect.get(Object(move), 'to_name');
    const from = Reflect.get(Object(move), 'from');
    const to = Reflect.get(Object(move), 'to');
    // Staying put is no move.
    if (from !== undefined && from === to) return [];
    return typeof person === 'string' && typeof place === 'string' ? [{ person, place }] : [];
  });
  return moved.length === 0 ? null : { moved, scene: null };
}

/** The campaign's one-line status, rewritten from the story so far (for the campaign list). */
export async function refreshStatusLine(chatId: string, leafId: string): Promise<void> {
  await step('status_line', 'status_line', { chat_id: chatId, leaf_id: leafId });
}

/** The world's clock moves on (routines, arrivals); the names of those who arrived. */
export async function worldTick(chatId: string, leafId: string, minutes: number, reason: string): Promise<string[]> {
  const answer = Object(
    await step('world_tick', 'world_tick', { chat_id: chatId, leaf_id: leafId, minutes, reason }),
  ) as Record<string, unknown>;
  const arrivals = Array.isArray(answer.arrivals) ? answer.arrivals : [];
  return arrivals.flatMap((one) => {
    const name = Reflect.get(Object(one), 'name');
    return typeof name === 'string' ? [name] : [];
  });
}

export interface Clarify {
  question: string;
  /** Each a choice: its label names the target, its value is the person's id. */
  options: { label: string; value: string }[];
}

/**
 * The GM's question when the person's line is truly ambiguous (the operator, 2026-11-21: "We need
 * question tool support for ambiguity"): which of those present an action means, or what they
 * intend. Null when the line is clear (or on any failure: the story goes on).
 */
export async function clarify(chatId: string, leafId: string): Promise<Clarify | null> {
  const answer = await step('clarify', 'clarify', { chat_id: chatId, leaf_id: leafId });
  if (answer === null || typeof answer !== 'object') return null;
  const question = Reflect.get(answer, 'question');
  const raw = Reflect.get(answer, 'options');
  if (typeof question !== 'string' || !Array.isArray(raw)) return null;
  const options = raw.flatMap((one) => {
    const label = Reflect.get(Object(one), 'label');
    const value = Reflect.get(Object(one), 'value');
    return typeof label === 'string' && typeof value === 'string' ? [{ label, value }] : [];
  });
  return options.length < 2 ? null : { question, options };
}

/** The person's actions that named no target, aimed at `target`: `Name act…` → `Name (at Target) act…`. */
export function aimAt(text: string, seatName: string, target: string): string {
  if (seatName === '') return text;
  return text
    .split('\n')
    .map((line) => {
      if (!line.startsWith(`${seatName} `)) return line;
      const rest = line.slice(seatName.length + 1);
      return /^[(:]/.test(rest) ? line : `${seatName} (at ${target}) ${rest}`;
    })
    .join('\n');
}

/**
 * The campaign's person by this name, made (GM-only, an NPC) the first time they speak: their id,
 * or null when the wiki can't (no campaign, not the GM), and the line stays the narrator's.
 */
export async function ensurePerson(chatId: string, name: string, line: string): Promise<string | null> {
  const answer = await step('ensure_person', 'ensure_person', { chat_id: chatId, name, line });
  const id = answer === null ? null : Reflect.get(Object(answer), 'id');
  return typeof id === 'string' ? id : null;
}
