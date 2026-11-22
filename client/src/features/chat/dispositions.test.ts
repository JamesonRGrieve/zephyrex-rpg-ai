// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/disposition-cases.json';
import { type Dispositions, type StanceUpdate, applyStances, parseStatus, sceneState } from './dispositions';

describe('the disposition cases both twins run', () => {
  it.each(cases.parse_cases)('$name', ({ text, parsed }) => {
    expect(parseStatus(text)).toEqual(parsed);
  });
  it.each(cases.apply_cases)('$name', ({ current, updates, after }) => {
    expect(applyStances(current as Dispositions, updates as StanceUpdate[], cases.people)).toEqual(after);
  });
  it.each(cases.scene_cases)('$name', ({ here, dispositions, viewer, text }) => {
    expect(sceneState(here, dispositions as Dispositions, viewer)).toBe(text);
  });
});
