// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/regex-cases.json';
import { applyRegex, compileFind, type RegexPlacement, type RegexScript, type RegexTarget } from './regex';

describe('applyRegex (contract/regex-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', (testCase) => {
    expect(
      applyRegex(
        testCase.text,
        testCase.scripts as RegexScript[],
        testCase.placement as RegexPlacement,
        testCase.target as RegexTarget,
        testCase.depth,
      ),
    ).toBe(testCase.result);
  });

  it('refuses an empty pattern, a repeated flag and a flag JavaScript and Python read differently', () => {
    expect(compileFind('//g')).toBeNull();
    expect(compileFind('/a/gg')).toBeNull();
    expect(compileFind('/a/u')).toBeNull();
    expect(compileFind('/a/gi')?.flags).toBe('gi');
  });
});
