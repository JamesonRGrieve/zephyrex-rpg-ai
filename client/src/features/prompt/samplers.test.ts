// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/sampler-cases.json';
import type { EndpointApi } from '~/contract';
import { samplerParams, samplerProblem, type SamplerValues } from './samplers';

describe('the sampler cases both twins run (audit gap 2)', () => {
  it.each(cases.param_cases)('$name', ({ values, api, params }) => {
    expect(samplerParams(values as SamplerValues, api as EndpointApi)).toEqual(params);
  });
  it.each(cases.problem_cases)('$name', ({ values, problem }) => {
    expect(samplerProblem(values)).toBe(problem);
  });
});
