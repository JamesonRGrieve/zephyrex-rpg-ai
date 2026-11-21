// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * NPCs piloted on the map as in-world time advances (the operator, 2026-11-21: "Each character should
 * have its own routine and motivations and the GM/decision agent should pilot them on the map as
 * time advances"). On a tick, each NPC that isn't present and isn't the seat gets bounded options,
 * every one a real wiki location: stay, its routine slot now, its location's parent, children and
 * siblings, and places its motivations name. The decision model picks one per NPC; with no answer it
 * follows its routine slot, else stays. Players know only where they last saw someone (last_seen).
 * Pure, and held to contract/world-tick-cases.json, which the SaaS server's WorldTick.py runs too.
 */
import { WORLD_TICK } from '~/contract';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';

/** In-world time: the campaign's day number and its "HH:MM". */
export interface Clock {
  day: number;
  time: string;
}

export interface RoutineSlot {
  from: string;
  to: string;
  /** Days of the week it runs on, 0 Monday (the wiki's; day 1 is a Monday); every day when absent or null. */
  days?: readonly number[] | null;
  location_id: string | null;
  activity?: string;
}

export interface TickPerson {
  id: string;
  name: string;
  location_id?: string | null;
  routine?: readonly RoutineSlot[] | null;
  motivations?: readonly string[] | null;
}

export interface TickLocation {
  id: string;
  name: string;
  parent_id?: string | null;
  aliases?: readonly string[];
}

export interface Move {
  person_id: string;
  from: string | null;
  to: string;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function names(text: string, location: TickLocation): boolean {
  return [location.name, ...(location.aliases ?? [])].some(
    (name) =>
      name.trim() !== '' && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(name.trim())}($|[^\\p{L}\\p{N}])`, 'iu').test(text),
  );
}

const minutes = (time: string): number => {
  const [hours, mins] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
};

const onDay = (slot: RoutineSlot, day: number): boolean =>
  slot.days === undefined || slot.days === null || slot.days.includes((((day - 1) % 7) + 7) % 7);

/** The routine slot running at a time: the first that holds it (an overnight slot counts from its start day). */
export function routineSlot(routine: readonly RoutineSlot[] | null | undefined, clock: Clock): RoutineSlot | null {
  const now = minutes(clock.time);
  for (const slot of routine ?? []) {
    const from = minutes(slot.from);
    const to = minutes(slot.to);
    if (
      from <= to
        ? from <= now && now < to && onDay(slot, clock.day)
        : (now >= from && onDay(slot, clock.day)) || (now < to && onDay(slot, clock.day - 1))
    )
      return slot;
  }
  return null;
}

/** Where an NPC may go on this tick: real location ids only, stay first, at most max_options. */
export function tickOptions(person: TickPerson, locations: readonly TickLocation[], clock: Clock): string[] {
  const real = new Map(locations.map((location) => [location.id, location]));
  const here = person.location_id ?? null;
  const parent = here === null ? null : (real.get(here)?.parent_id ?? null);
  const wanted = [
    here,
    routineSlot(person.routine, clock)?.location_id ?? null,
    parent,
    ...locations.filter((location) => here !== null && location.parent_id === here).map((location) => location.id),
    ...locations
      .filter((location) => parent !== null && location.parent_id === parent && location.id !== here)
      .map((location) => location.id),
    ...locations
      .filter((location) => (person.motivations ?? []).some((motivation) => names(motivation, location)))
      .map((location) => location.id),
  ];
  const options: string[] = [];
  for (const id of wanted) {
    if (id !== null && real.has(id) && !options.includes(id)) options.push(id);
  }
  return options.slice(0, WORLD_TICK.max_options);
}

/**
 * The decision model's questions (one per NPC that may move), what each option picks, and where each
 * NPC goes without an answer (its routine slot, else where it is).
 */
export function tickQuestions(
  persons: readonly TickPerson[],
  locations: readonly TickLocation[],
  clock: Clock,
  still: readonly string[],
): {
  questions: Record<string, DecideQuestion>;
  picks: Record<string, Record<string, string>>;
  fallbacks: Record<string, string | null>;
} {
  const real = new Map(locations.map((location) => [location.id, location]));
  const questions: Record<string, DecideQuestion> = {};
  const picks: Record<string, Record<string, string>> = {};
  const fallbacks: Record<string, string | null> = {};
  for (const person of persons.filter((one) => !still.includes(one.id)).slice(0, WORLD_TICK.max_npcs)) {
    const options = tickOptions(person, locations, clock);
    if (options.length === 0) continue;
    const here = person.location_id ?? null;
    const labels: Record<string, string> = {};
    for (const id of options) {
      const place = real.get(id)?.name ?? id;
      const base = id === here ? WORLD_TICK.stay.replaceAll('{{place}}', place) : place;
      let label = base;
      for (let count = 2; label in labels; count += 1) label = `${base} (${count})`;
      labels[label] = id;
    }
    const slot = routineSlot(person.routine, clock);
    const wants = (person.motivations ?? []).map((motivation) => motivation.trim()).filter((one) => one !== '');
    const instructions = WORLD_TICK.instructions
      .replaceAll('{{day}}', String(clock.day))
      .replaceAll('{{time}}', clock.time)
      .replaceAll('{{name}}', person.name)
      .replaceAll(
        '{{activity}}',
        slot?.activity?.trim() ? WORLD_TICK.activity.replaceAll('{{activity}}', slot.activity.trim()) : '',
      )
      .replaceAll(
        '{{motivations}}',
        wants.length === 0 ? '' : WORLD_TICK.motivations.replaceAll('{{motivations}}', wants.join('; ')),
      );
    questions[person.id] = { type: 'choice', instructions, criteria: Object.keys(labels) };
    picks[person.id] = labels;
    const routed = slot?.location_id ?? null;
    fallbacks[person.id] = routed !== null && real.has(routed) ? routed : here;
  }
  return { questions, picks, fallbacks };
}

/** The moves the answers make: each NPC to its pick, or its fallback; staying put is no move. */
export function tickMoves(
  answers: Readonly<Record<string, DecideAnswer | null | undefined>> | null | undefined,
  picks: Readonly<Record<string, Readonly<Record<string, string>>>>,
  fallbacks: Readonly<Record<string, string | null>>,
  persons: readonly TickPerson[],
): Move[] {
  const moves: Move[] = [];
  for (const person of persons) {
    const options = picks[person.id];
    if (options === undefined) continue;
    const answer = answers?.[person.id];
    const picked = answer !== undefined && answer !== null && 'choice' in answer ? options[answer.choice] : undefined;
    const to = picked ?? fallbacks[person.id] ?? null;
    const from = person.location_id ?? null;
    if (to !== null && to !== from) moves.push({ person_id: person.id, from, to });
  }
  return moves;
}

function inside(location: string | null, scene: string, parents: ReadonlyMap<string, string | null>): boolean {
  let at = location;
  for (let step = 0; at !== null && step < 32; step += 1) {
    if (at === scene) return true;
    at = parents.get(at) ?? null;
  }
  return false;
}

/** Who a tick brings into the party's scene (to narrate their arrival): moved there from outside it. */
export function arrivals(
  moves: readonly Move[],
  sceneLocation: string | null,
  locations: readonly TickLocation[],
): string[] {
  if (sceneLocation === null) return [];
  const parents = new Map(locations.map((location) => [location.id, location.parent_id ?? null]));
  return moves
    .filter((move) => inside(move.to, sceneLocation, parents) && !inside(move.from, sceneLocation, parents))
    .map((move) => move.person_id);
}

/** What the decision model reads on a tick: the time and where the party is. */
export function tickState(clock: Clock, partyPlace: string | null): string {
  return WORLD_TICK.state
    .replaceAll('{{day}}', String(clock.day))
    .replaceAll('{{time}}', clock.time)
    .replaceAll('{{place}}', partyPlace ?? WORLD_TICK.nowhere);
}

export type LastSeen = Readonly<Record<string, { location_id: string | null; day: number; time: string }>>;

/** The chat's last-seen record after a turn: each person present now is seen where they are now. */
export function lastSeenAfter(
  lastSeen: LastSeen,
  present: readonly string[],
  locationOf: Readonly<Record<string, string | null>>,
  clock: Clock,
): Record<string, { location_id: string | null; day: number; time: string }> {
  const next = { ...lastSeen };
  for (const id of present) next[id] = { location_id: locationOf[id] ?? null, day: clock.day, time: clock.time };
  return next;
}

/** The lines a character's voice reads about those not present: where each was last seen, never where they are. */
export function lastSeenLines(
  lastSeen: LastSeen,
  persons: readonly { id: string; name: string }[],
  present: readonly string[],
  locations: readonly TickLocation[],
): string[] {
  const named = new Map(locations.map((location) => [location.id, location.name]));
  return persons.flatMap((person) => {
    const seen = lastSeen[person.id];
    if (present.includes(person.id) || seen === undefined || seen.location_id === null) return [];
    const place = named.get(seen.location_id);
    return place === undefined
      ? []
      : [WORLD_TICK.last_seen.replaceAll('{{name}}', person.name).replaceAll('{{place}}', place)];
  });
}
