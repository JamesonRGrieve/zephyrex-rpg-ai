// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/narrator-style-cases.json';
import {
  type NarratorStyle,
  type StyleEndpoint,
  type Traits,
  mayNarrate,
  modelKey,
  narratorEndpoint,
  styleProblem,
  styleTuning,
  traitsOf,
  traitsProblem,
} from './narratorStyle';

describe('the narrator style cases both twins run', () => {
  it.each(cases.key_cases)('$model', ({ model, key }) => {
    expect(modelKey(model)).toBe(key);
  });
  it.each(cases.narrate_cases)('$name', (one) => {
    const traits = 'traits' in one ? (one.traits as Traits) : null;
    expect(mayNarrate(traitsOf({ model: one.model, traits }))).toBe(one.may);
  });
  it.each(cases.choice_cases)('$name', (one) => {
    const endpoints = ('endpoints' in one ? one.endpoints : cases.endpoints) as StyleEndpoint[];
    expect(narratorEndpoint(endpoints, one.style as NarratorStyle | null, one.explicit)).toBe(one.chosen);
  });
  it.each(cases.tuning_cases)('$name', ({ style, rating, tuning }) => {
    expect(styleTuning(style as NarratorStyle | null, rating)).toEqual(tuning);
  });
  it.each(cases.traits_problem_cases)('traits $value', ({ value, problem }) => {
    expect(traitsProblem(value)).toBe(problem);
  });
  it.each(cases.style_problem_cases)('style $value', ({ value, problem }) => {
    expect(styleProblem(value)).toBe(problem);
  });
});
