// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/opening-cases.json';
import { type OpeningEntity, openingFor } from './opening';

describe('the opening cases both twins run', () => {
  it.each(cases.cases)('$name', ({ seated, situation, entities, scene, default: fallback, text, location_id, starts }) => {
    expect(openingFor(seated, situation, entities as OpeningEntity[], scene, fallback)).toEqual({
      text,
      location_id,
      starts,
    });
  });
});
