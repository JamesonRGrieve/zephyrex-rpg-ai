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
  const parts = [situation.trim()];
  if (location !== undefined) {
    const others = persons
      .filter((person) => person.id !== seatedId && person.gm_only !== true && starts[person.id] === location.id)
      .map((person) => person.name);
    parts.push(
      [
        OPENING.told.replaceAll('{{location}}', location.name),
        (location.summary ?? '').trim(),
        others.length === 0 ? '' : OPENING.with.replaceAll('{{names}}', others.join(', ')),
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
  }
  return { text: parts.filter((part) => part !== '').join('\n\n'), location_id: location?.id ?? null, starts };
}
