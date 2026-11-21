// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/group-settings-cases.json';
import { groupSettingsProblem } from './groupSettings';

describe('the group settings cases both twins run (audit gap 6)', () => {
  it.each(cases.problem_cases)('$name', ({ value, problem }) => {
    expect(groupSettingsProblem(value)).toBe(problem);
  });
});
