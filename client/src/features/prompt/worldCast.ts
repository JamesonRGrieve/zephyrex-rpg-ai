// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A chat's cast from the wiki (the composed suite, docs/DESIGN.md): its character ids are wiki
 * person ids, read from the same world entities World Info reads. Persons only, in the chat's order;
 * an id that's no longer a person in the campaign (deleted, or another kind) drops out. The person
 * the seat holds is who the person speaks as. Pure, and held to contract/world-cast-cases.json,
 * which the SaaS server's WorldCast.py runs too.
 */
import { type PersonCharacter, personCharacter, type WikiPerson } from './personVoice';

export interface CastEntity extends WikiPerson {
  kind: string;
  deleted?: boolean;
}

/** The chat's cast as prompt characters, in its order. */
export function worldCast(entities: readonly CastEntity[], characterIds: readonly string[]): PersonCharacter[] {
  const persons = new Map(
    entities.filter((entity) => entity.kind === 'person' && entity.deleted !== true).map((entity) => [entity.id, entity]),
  );
  return characterIds.flatMap((id) => {
    const person = persons.get(id);
    return person === undefined ? [] : [personCharacter(person)];
  });
}

/** The person the seat holds, as the prompt's persona (name and description); none when no one is seated. */
export function seatPerson(
  entities: readonly CastEntity[],
  seatedId: string | null,
): { name: string; description: string } | null {
  if (seatedId === null) return null;
  const person = entities.find((entity) => entity.id === seatedId && entity.kind === 'person' && entity.deleted !== true);
  return person === undefined ? null : { name: person.name, description: (person.summary ?? '').trim() };
}

/**
 * What one voice may know of the world (the operator's play-test, E): a GM-only record (the wiki's
 * `gm_only`: GM secrets, private notes, scenario truth) reaches only the GM's prompts (narrating, the
 * table GM) and that person's own voice. To anyone else a GM-only person is a name, and any other
 * GM-only record isn't there at all.
 */
export function worldKnownTo<T extends CastEntity & { gm_only?: boolean; lore?: unknown }>(
  entities: readonly T[],
  viewerId: string | null,
  gm: boolean,
): T[] {
  if (gm) return [...entities];
  return entities.flatMap((entity) => {
    if (entity.gm_only !== true || entity.id === viewerId) return [entity];
    return entity.kind === 'person' ? [{ ...entity, summary: '', voice: null, lore: null } as T] : [];
  });
}
