// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/world-cast-cases.json';
import { type CastEntity, seatPerson, worldCast } from './worldCast';

const entities = cases.entities as CastEntity[];

describe('the world cast cases both twins run', () => {
  it.each(cases.cast_cases)('$name', ({ character_ids: characterIds, cast }) => {
    expect(worldCast(entities, characterIds)).toEqual(cast);
  });
  it.each(cases.seat_cases)('$name', ({ seated, persona }) => {
    expect(seatPerson(entities, seated)).toEqual(persona);
  });
});
