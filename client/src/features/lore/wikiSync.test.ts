// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/wiki-sync-cases.json';
import { entityKeys, type SyncedEntry, syncPlan, type WikiEntity } from './wikiSync';

describe('syncPlan (contract/wiki-sync-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', (testCase) => {
    expect(syncPlan(testCase.entries as SyncedEntry[], testCase.entities as WikiEntity[])).toEqual(testCase.expected);
  });
});

describe('entityKeys', () => {
  it('compares keys without case but keeps the first spelling', () => {
    expect(entityKeys({ name: 'Mira', aliases: ['MIRA', 'Mira of the Gate'] })).toEqual(['Mira', 'Mira of the Gate']);
  });
});
