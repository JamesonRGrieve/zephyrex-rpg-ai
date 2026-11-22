// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where a seat with no place of its own starts (the operator, 2026-11-22, of the Sullenmire campaign:
 * "completely fucking broken. Figure out why and make sure this never happens again": the seated pregen
 * had no location and the framing named none, so the opening had no place, no banner, nobody present).
 * The place the opening names (the longest name it mentions), else where most of the scenario's people
 * are, else the first place with no parent; null only when the campaign has no places at all.
 */
import type { OpeningEntity } from './opening';

export function startPlace(situation: string, entities: readonly OpeningEntity[]): string | null {
  const live = entities.filter((entity) => entity.deleted !== true);
  const places = live.filter((entity) => entity.kind === 'location');
  if (places.length === 0) return null;
  const text = situation.toLowerCase();
  const named = places
    .filter((place) => place.name.trim().length >= 3 && text.includes(place.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named !== undefined) return named.id;
  const counts = new Map<string, number>();
  for (const person of live)
    if (person.kind === 'person' && person.location_id != null)
      counts.set(person.location_id, (counts.get(person.location_id) ?? 0) + 1);
  const busiest = [...counts.entries()]
    .filter(([id]) => places.some((place) => place.id === id))
    .sort((a, b) => b[1] - a[1])[0];
  if (busiest !== undefined) return busiest[0];
  return (places.find((place) => place.parent_id == null) ?? places[0])?.id ?? null;
}
