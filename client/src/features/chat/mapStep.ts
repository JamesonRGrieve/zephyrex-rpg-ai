// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map follows the story (the operator, 2026-11-21: "The GM needs to update the map based on what
 * I say in narrative mode"): after a round, the server's map step lets the decision model move tokens
 * and change the scene, choosing only from the scene's tokens and the campaign's scenes, applied
 * through the VTT. Every 6 rounds the world ticks too, so the cast follows their routines.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';

export interface MapChange {
  moved: string[];
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

/** Moves the map after the round ending at `leafId`; what changed, or null when nothing did. */
export async function mapStep(chatId: string, leafId: string): Promise<MapChange | null> {
  const answer = Object(await step('map_step', 'map_step', { chat_id: chatId, leaf_id: leafId })) as Record<string, unknown>;
  const moves = Array.isArray(answer.moves) ? answer.moves : [];
  const moved = moves.flatMap((move) => {
    const label = Reflect.get(Object(move), 'label');
    return typeof label === 'string' && label !== '' ? [label] : [];
  });
  const scene = typeof answer.scene_name === 'string' ? answer.scene_name : null;
  return moved.length === 0 && scene === null ? null : { moved, scene };
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
  /** Each a choice; `value` is the person's line rewritten with the ambiguity settled. */
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
