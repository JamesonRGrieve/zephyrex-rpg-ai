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

/**
 * Where the seat's character is after the round's moves, and whether this round moved them: the
 * banner's place (the operator, 2026-11-21: "It got the location change wrong again, it cited the old
 * location"). Server truth, never the narrator's word. Null place when the seat has no location.
 */
export function seatPlace(
  seatId: string | null,
  persons: readonly { id: string; location_id: string | null }[],
  locations: readonly { id: string; name: string; parent_id?: string | null }[],
  moves: readonly { person_id: string; from: string | null; to: string }[],
): { seat_location: { id: string; name: string; chain: string[] } | null; seat_moved: boolean } {
  if (seatId === null) return { seat_location: null, seat_moved: false };
  const own = moves.filter((move) => move.person_id === seatId);
  const last = own.at(-1);
  const at = last?.to ?? persons.find((person) => person.id === seatId)?.location_id ?? null;
  const place = at === null ? undefined : locations.find((location) => location.id === at);
  return {
    seat_location: place === undefined ? null : { id: place.id, name: place.name, chain: placeChain(place, locations) },
    seat_moved: own.some((move) => move.from !== move.to),
  };
}

/** A place's chain up to its top (the operator, 2026-11-23: fully qualified locations), nearest first. */
export function placeChain(
  place: { id: string; parent_id?: string | null },
  locations: readonly { id: string; name: string; parent_id?: string | null }[],
): string[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const chain: string[] = [];
  const seen = new Set([place.id]);
  let parent = place.parent_id ?? null;
  while (parent !== null && byId.has(parent) && !seen.has(parent)) {
    seen.add(parent);
    const above = byId.get(parent);
    if (above === undefined) break;
    chain.push(above.name);
    parent = above.parent_id ?? null;
  }
  return chain;
}

const SCENE = MAP_STEP.scene;

function named(text: string, person: { name: string; aliases?: readonly string[] }): boolean {
  const lowered = text.toLowerCase();
  return [person.name, ...(person.aliases ?? [])].some((name) => {
    const bare = name.trim().toLowerCase();
    if (bare === '') return false;
    const escaped = bare.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?<![\\w'])${escaped}(?![\\w'])`, 'u').test(lowered);
  });
}

/**
 * One question per person the round's lines name (the seat's own character aside: the player moves them):
 * on the scene, whether they're still here; off it, whether they've arrived (the operator, 2026-11-23:
 * "the DM correctly moves people on the map"). None named, none.
 */
export function sceneQuestions(
  text: string,
  people: readonly { id: string; name: string; aliases?: readonly string[] }[],
  onScene: readonly string[],
  seat: string | null,
): Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }> {
  const here = new Set(onScene);
  const questions: Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }> = {};
  for (const person of people) {
    if (person.id === seat || !named(text, person)) continue;
    const present = here.has(person.id);
    questions[`scene_${person.id}`] = {
      type: 'choice',
      instructions: (present ? SCENE.stay_question : SCENE.arrive_question).replaceAll('{{name}}', person.name),
      criteria: Object.fromEntries(
        (present ? [SCENE.stays, SCENE.leaves] : [SCENE.arrives, SCENE.absent]).map((option) => [
          option,
          SCENE.meanings[option as keyof typeof SCENE.meanings],
        ]),
      ),
    };
  }
  return questions;
}

/** The scene moves the answers make: {person_id, change: "left" | "arrived"}; staying is none. */
export function sceneChanges(
  answers: Readonly<Record<string, unknown>> | null,
  questions: Readonly<Record<string, unknown>>,
): { person_id: string; change: 'left' | 'arrived' }[] {
  const changes: { person_id: string; change: 'left' | 'arrived' }[] = [];
  for (const key of Object.keys(questions)) {
    const choice: unknown = Reflect.get(Object(answers?.[key]), 'choice');
    const personId = key.replace(/^scene_/u, '');
    if (choice === SCENE.leaves) changes.push({ person_id: personId, change: 'left' });
    else if (choice === SCENE.arrives) changes.push({ person_id: personId, change: 'arrived' });
  }
  return changes;
}
