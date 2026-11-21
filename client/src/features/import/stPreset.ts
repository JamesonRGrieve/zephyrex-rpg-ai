// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A SillyTavern preset in (audit gap 2), as this app's generation preset. Pure.
 *
 * It reads both kinds SillyTavern saves: a text-completion preset (`temp`, `rep_pen`, `min_p`,
 * `dry_multiplier`, `genamt`, `max_length`, …) and a chat-completion preset (`temperature`,
 * `frequency_penalty`, `openai_max_tokens`, `openai_max_context`, …). Every value is checked against
 * the contract's ranges: one out of range is left out and named, and so is every key with no
 * counterpart here (prompts, formatting and backend switches), so the person sees what didn't come.
 */
import { PRESET_DEFAULTS, SAMPLER_EXTRAS, SAMPLER_RANGES, SAMPLERS, type SamplerSetting } from '~/contract';
import { isSet, type SamplerValue, samplerProblem } from '~/features/prompt/samplers';

export interface ImportedPreset {
  /** The four every preset has, and the window, where the file sets them. */
  base: Partial<Record<SamplerSetting, number>>;
  /** The further samplers it sets (only the ones away from their off value are worth keeping). */
  samplers: Record<string, SamplerValue>;
  negative_prompt?: string;
  guidance_scale?: number;
  /** Keys the file holds that have no counterpart here, or whose value is out of range. */
  unmapped: string[];
}

/** The preset's own settings, by every name SillyTavern saves them under. */
const BASE: Record<string, SamplerSetting> = {
  temp: 'temperature',
  temperature: 'temperature',
  top_p: 'top_p',
  top_k: 'top_k',
  rep_pen: 'repetition_penalty',
  repetition_penalty: 'repetition_penalty',
  genamt: 'max_tokens',
  openai_max_tokens: 'max_tokens',
  max_length: 'context_tokens',
  openai_max_context: 'context_tokens',
};

/** The further samplers, by SillyTavern's names where they differ from ours. */
const FURTHER: Record<string, string> = {
  presence_pen: 'presence_penalty',
  freq_pen: 'frequency_penalty',
  rep_pen_range: 'repetition_penalty_range',
  rep_pen_slope: 'repetition_penalty_slope',
  nsigma: 'top_n_sigma',
  banned_tokens: 'banned_strings',
  samplers: 'sampler_order',
};

/** Keys SillyTavern writes that mean nothing on their own here (they ride with others). */
const QUIET = new Set(['name', 'dynatemp', 'min_temp', 'max_temp']);

const SAMPLER_NAMES = new Set(SAMPLERS.params.map((param) => param.name));

function lines(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? (value as string[]) : null;
  if (typeof value !== 'string') return null;
  // DRY's breakers are saved as a JSON list in a string; banned tokens as one per line.
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed as string[];
  } catch {
    // not JSON: one per line
  }
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** A SillyTavern preset file as this app's preset settings, and what didn't come across. */
export function presetFromSillyTavern(json: unknown): ImportedPreset {
  const file = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const result: ImportedPreset = { base: {}, samplers: {}, unmapped: [] };
  const inRange = (value: unknown, [low, high]: readonly [number, number] | readonly number[]) =>
    typeof value === 'number' && Number.isFinite(value) && value >= (low ?? 0) && value <= (high ?? 0);

  for (const [key, value] of Object.entries(file)) {
    if (QUIET.has(key)) continue;
    const base = BASE[key];
    if (base !== undefined) {
      if (inRange(value, SAMPLER_RANGES[base])) result.base[base] = value as number;
      else result.unmapped.push(key);
      continue;
    }
    if (key === 'negative_prompt') {
      if (typeof value === 'string' && value.trim() !== '') result.negative_prompt = value;
      continue;
    }
    if (key === 'guidance_scale') {
      if (value === 1 || value === null) continue;
      if (inRange(value, SAMPLER_EXTRAS.guidance_scale_range)) result.guidance_scale = value as number;
      else result.unmapped.push(key);
      continue;
    }
    const name = FURTHER[key] ?? key;
    if (!SAMPLER_NAMES.has(name)) {
      result.unmapped.push(key);
      continue;
    }
    const param = SAMPLERS.params.find((one) => one.name === name);
    const candidate: unknown = param?.kind === 'strings' ? lines(value) : value;
    if (candidate === null || samplerProblem({ [name]: candidate }) !== null) {
      result.unmapped.push(key);
      continue;
    }
    // A sampler at its off value is left out: a preset keeps only the ones set.
    if (param !== undefined && isSet(param, { [name]: candidate as SamplerValue }))
      result.samplers[name] = candidate as SamplerValue;
  }

  // Dynamic temperature: SillyTavern saves a switch and a min and max; here it's a range around the temperature.
  if (file.dynatemp === true && typeof file.min_temp === 'number' && typeof file.max_temp === 'number') {
    const range = Math.abs(file.max_temp - file.min_temp) / 2;
    if (samplerProblem({ dynatemp_range: range }) === null) {
      result.samplers.dynatemp_range = range;
      result.base.temperature ??= (file.max_temp + file.min_temp) / 2;
    } else result.unmapped.push('dynatemp');
  }
  if (file.dynatemp !== true) delete result.samplers.dynatemp_exponent;

  result.unmapped.sort();
  return result;
}

/** The base settings a preset made from the file starts with: the file's, else the contract's defaults. */
export function importedBase(imported: ImportedPreset): Record<SamplerSetting, number> {
  return { ...PRESET_DEFAULTS, ...imported.base };
}
