// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern's further samplers (audit gap 2): min-P, typical-P, top-A, TFS, presence and
 * frequency penalty, repetition-penalty range and slope, DRY, XTC, Mirostat, dynamic temperature,
 * smoothing, epsilon and eta cutoffs, top-nsigma, seed, banned strings and sampler order. Pure, and
 * held to contract/sampler-cases.json, which the SaaS server's Samplers.py runs too.
 *
 * A preset keeps only the ones set (`samplers`). Each goes upstream only when it's set away from its
 * neutral value, only to an API family that takes it, and only when the sampler it requires (DRY's
 * base needs its multiplier, say) is set too; it's sent under every name in its `wire`, so each
 * backend finds the one it reads. An OpenAI-compatible chat API is never sent one it would refuse.
 */
import { type EndpointApi, SAMPLERS, type SamplerParam } from '~/contract';

export type SamplerValue = number | string[];
export type SamplerValues = Readonly<Record<string, SamplerValue>>;

const sameValue = (value: SamplerValue, neutral: SamplerParam['neutral']): boolean =>
  Array.isArray(value) && Array.isArray(neutral)
    ? value.length === neutral.length && value.every((item, index) => item === neutral[index])
    : value === neutral;

/** Whether a sampler is set away from its off value. */
export function isSet(param: SamplerParam, values: SamplerValues): boolean {
  const value = values[param.name];
  return value !== undefined && !sameValue(value, param.neutral);
}

/** The request fields for the samplers a preset sets, for an endpoint of `api`. */
export function samplerParams(values: SamplerValues, api: EndpointApi): Record<string, SamplerValue> {
  const byName = new Map(SAMPLERS.params.map((param) => [param.name, param]));
  const out: Record<string, SamplerValue> = {};
  for (const param of SAMPLERS.params) {
    if (!(param.apis as readonly string[]).includes(api) || !isSet(param, values)) continue;
    const needed = param.requires === undefined ? undefined : byName.get(param.requires);
    if (needed !== undefined && !isSet(needed, values)) continue;
    const value = values[param.name] as SamplerValue;
    for (const name of param.wire) out[name] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

/** Why a preset's samplers can't be kept, or null: unknown names, wrong kinds, out of range. */
export function samplerProblem(values: Readonly<Record<string, unknown>>): string | null {
  const byName = new Map(SAMPLERS.params.map((param) => [param.name, param]));
  for (const [name, value] of Object.entries(values)) {
    const param = byName.get(name);
    if (param === undefined) return `${name} isn't a sampler`;
    const [low, high] = param.range;
    if (param.kind === 'strings') {
      if (
        !Array.isArray(value) ||
        value.length < low ||
        value.length > high ||
        !value.every((item) => typeof item === 'string' && Array.from(item).length <= SAMPLERS.string_characters)
      )
        return `${name} takes up to ${high} lines of at most ${SAMPLERS.string_characters} characters`;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
      return `${name} is from ${low} to ${high}`;
    if (param.kind === 'integer' && !Number.isInteger(value)) return `${name} is a whole number`;
  }
  return null;
}
