// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/extra-body-cases.json';
import { extraBodyProblem, readExtraBody, withExtraBody } from './extraBody';

describe('the extra request field cases both twins run', () => {
  it.each(cases.problem_cases)('$name', ({ value, problem }) => {
    expect(extraBodyProblem(value)).toBe(problem);
  });
  it.each(cases.merge_cases)('$name', ({ body, extra, merged }) => {
    expect(withExtraBody(body, extra)).toEqual(merged);
  });
});

describe('readExtraBody', () => {
  it('reads blank as none, JSON as the object, and says why anything else is refused', () => {
    expect(readExtraBody('  ')).toEqual({ value: {} });
    expect(readExtraBody('{"reasoning_effort": "none"}')).toEqual({ value: { reasoning_effort: 'none' } });
    expect(readExtraBody('{reasoning_effort: none}')).toEqual({ problem: 'Extra request fields must be valid JSON' });
    expect(readExtraBody('{"stream": false}')).toEqual({ problem: "Extra request fields can't set stream" });
  });
});
