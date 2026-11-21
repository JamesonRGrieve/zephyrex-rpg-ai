// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The map follows the story (the operator, 2026-11-21): after a round, each person whose do line
 * moves them (a movement word) is asked where they now are, among real places only: stay, around
 * where they are, and any place the line names (worldTick's options). No movement, no model call.
 * Pure, and held to contract/map-step-cases.json with ai_chat/MapStep.py.
 */
import { MAP_STEP } from '~/contract';
import type { DecideQuestion } from '~/features/decide/decide';
import type { PlayerLine } from '~/features/chat/playerLines';
import { type Clock, type TickLocation, tickOptions } from './worldTick';

/** Each person whose do lines move them, with what they did (their do lines joined). */
export function movers(items: readonly PlayerLine[]): { id: string; action: string }[] {
  const found = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== 'do' || item.speaker_id === null) continue;
    const words = item.text.toLowerCase().split(/[^\p{L}']+/u);
    if (!MAP_STEP.movement_words.some((word) => words.includes(word))) continue;
    found.set(item.speaker_id, [...(found.get(item.speaker_id) ?? []), item.text]);
  }
  return [...found].map(([id, actions]) => ({ id, action: actions.join(' ') }));
}

/** One question per mover, what each option picks (a location id), and staying as the fallback. */
export function mapQuestions(
  moving: readonly { id: string; action: string }[],
  persons: readonly { id: string; name: string; location_id?: string | null }[],
  locations: readonly TickLocation[],
): {
  questions: Record<string, DecideQuestion>;
  picks: Record<string, Record<string, string>>;
  fallbacks: Record<string, string | null>;
} {
  const real = new Map(locations.map((location) => [location.id, location]));
  const clock: Clock = { day: 1, time: '00:00' };
  const questions: Record<string, DecideQuestion> = {};
  const picks: Record<string, Record<string, string>> = {};
  const fallbacks: Record<string, string | null> = {};
  for (const mover of moving) {
    const person = persons.find((one) => one.id === mover.id);
    if (person === undefined) continue;
    const here = person.location_id ?? null;
    const options = tickOptions({ ...person, routine: null, motivations: [mover.action] }, locations, clock);
    if (options.length < (here === null ? 1 : 2)) continue;
    const labels: Record<string, string> = {};
    for (const id of options) {
      const place = real.get(id)?.name ?? id;
      let label = id === here ? `Stay at ${place}` : place;
      for (let count = 2; label in labels; count += 1) label = `${place} (${count})`;
      labels[label] = id;
    }
    questions[mover.id] = {
      type: 'choice',
      instructions: MAP_STEP.instructions.replaceAll('{{name}}', person.name).replaceAll('{{action}}', mover.action),
      criteria: Object.keys(labels),
    };
    picks[mover.id] = labels;
    fallbacks[mover.id] = here;
  }
  return { questions, picks, fallbacks };
}
