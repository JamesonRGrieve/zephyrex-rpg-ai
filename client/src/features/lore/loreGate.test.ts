// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/lore-gate-cases.json';
import { applyLorePick, loreGateNeeded } from './loreGate';

describe('the lore gate (contract/lore-gate-cases.json, shared with the server)', () => {
  it.each(cases.needed)('needed: $name', (testCase) => {
    expect(loreGateNeeded(testCase.tokens, testCase.budget)).toBe(testCase.needed);
  });

  it.each(cases.apply)('apply: $name', (testCase) => {
    expect(applyLorePick(testCase.entries, testCase.picked, testCase.budget)).toEqual(testCase.kept);
  });
});
