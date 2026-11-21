// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/injection-cases.json';
import { injectionsProblem, injectionsText, withInjection, withoutInjection } from './injections';

describe('the injection cases both twins run (audit gap 5)', () => {
  it.each(cases.problem_cases)('$name', ({ value, problem }) => {
    expect(injectionsProblem(value)).toBe(problem);
  });
});

describe('/inject, /listinjects and /flushinject', () => {
  it('sets, replaces, lists and flushes injections', () => {
    const one = withInjection([], { id: 'mood' }, 'It is raining.');
    expect(one).toEqual([{ id: 'mood', text: 'It is raining.', position: 'chat', depth: 4, role: 'system' }]);
    const two = withInjection(one, { id: 'rule', position: 'after', depth: '9', role: 'user' }, 'Be brief.');
    const replaced = withInjection(two, { id: 'mood', depth: '1' }, 'It is snowing.');
    expect(replaced.map((injection) => [injection.id, injection.text, injection.depth])).toEqual([
      ['rule', 'Be brief.', 9],
      ['mood', 'It is snowing.', 1],
    ]);
    expect(injectionsText(replaced)).toBe('rule (after): Be brief.\nmood (depth 1, system): It is snowing.');
    expect(withInjection(replaced, { id: 'rule' }, '  ')).toHaveLength(1);
    expect(withoutInjection(replaced, 'mood').map((injection) => injection.id)).toEqual(['rule']);
    expect(withoutInjection(replaced, '')).toEqual([]);
    expect(() => withInjection([], {}, 'x')).toThrow('/inject needs an id=');
  });
});
