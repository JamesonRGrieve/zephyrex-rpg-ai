// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/scene-cases.json';
import { sceneLocation } from './sceneLocation';

describe('sceneLocation (contract/scene-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', (testCase) => {
    expect(sceneLocation(testCase.lines, cases.locations)).toBe(testCase.location);
  });
});
