// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A campaign's opening (the operator, 2026-11-21: "It should also not ask where I am. It should tell
 * me."): the framing's Opening Situation, then the seat's told position: where they are, what is
 * there and who is with them. Each person starts at their wiki location, else where the VTT scene
 * holding their token is, else (the seat only) the framing's default; presence reads the same starts
 * from the first turn. Pure, and held to contract/opening-cases.json with ai_campaign/Opening.py.
 */
import { OPENING } from '~/contract';

export interface OpeningEntity {
  id: string;
  kind: string;
  name: string;
  summary?: string;
  location_id?: string | null;
  /** A location's parent place (town, region…). */
  parent_id?: string | null;
  gm_only?: boolean;
  deleted?: boolean;
}

/** The VTT's initial scene, when there is one: its location and whose tokens it holds. */
export interface OpeningScene {
  location_id: string | null;
  entity_ids: readonly string[];
}

export function openingFor(
  seatedId: string | null,
  situation: string,
  entities: readonly OpeningEntity[],
  scene: OpeningScene | null,
  defaultLocation: string | null,
): { text: string; location_id: string | null; starts: Record<string, string | null> } {
  const live = entities.filter((entity) => entity.deleted !== true);
  const persons = live.filter((entity) => entity.kind === 'person');
  const starts: Record<string, string | null> = {};
  for (const person of persons) {
    const fromScene = scene !== null && scene.entity_ids.includes(person.id) ? scene.location_id : null;
    starts[person.id] = person.location_id ?? fromScene ?? (person.id === seatedId ? defaultLocation : null);
  }
  const at = seatedId === null ? null : (starts[seatedId] ?? null);
  const location = live.find((entity) => entity.kind === 'location' && entity.id === at);
  let parts = [situation.trim()];
  if (location !== undefined) {
    const others = persons
      .filter((person) => person.id !== seatedId && person.gm_only !== true && starts[person.id] === location.id)
      .map((person) => person.name);
    // The banner: the place, then its parents (town, then region) as the subtitle (the operator,
    // 2026-11-22); never the place's raw wiki entry.
    const byId = new Map(live.filter((entity) => entity.kind === 'location').map((entity) => [entity.id, entity]));
    const places: string[] = [];
    let parent = byId.get(location.parent_id ?? '');
    while (parent !== undefined && places.length < 3) {
      places.push(parent.name);
      parent = byId.get(parent.parent_id ?? '');
    }
    const within = places.length === 0 ? '' : OPENING.within.replaceAll('{{places}}', places.join(', '));
    const banner = OPENING.told.replaceAll('{{location}}', location.name).replaceAll('{{within}}', within);
    parts = [banner, situation.trim()];
    if (others.length > 0) parts.push(OPENING.with.replaceAll('{{names}}', others.join(', ')));
  }
  return { text: parts.filter((part) => part !== '').join('\n\n'), location_id: location?.id ?? null, starts };
}
