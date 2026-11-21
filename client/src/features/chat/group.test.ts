// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/group-cases.json';
import { type GuardMode, groupStops } from './group';

describe('group stop strings (contract/group-cases.json)', () => {
  it.each(cases.cases)('$name', (one) => {
    expect(groupStops(one.mode as GuardMode, one.speaker, one.cast, one.person)).toEqual(one.stops);
  });
});
