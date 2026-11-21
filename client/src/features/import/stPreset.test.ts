// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PRESET_DEFAULTS } from '~/contract';
import { importedBase, presetFromSillyTavern } from './stPreset';

describe('a SillyTavern preset in (audit gap 2)', () => {
  it('reads a text-completion preset, its samplers by their SillyTavern names', () => {
    const imported = presetFromSillyTavern({
      temp: 0.7,
      top_p: 1,
      top_k: 0,
      rep_pen: 1.05,
      rep_pen_range: 2048,
      min_p: 0.05,
      typical_p: 1,
      dry_multiplier: 0.8,
      dry_base: 1.75,
      dry_sequence_breakers: '["\\n", ":"]',
      xtc_probability: 0.5,
      xtc_threshold: 0.1,
      banned_tokens: 'As an AI\nI cannot',
      genamt: 350,
      max_length: 16384,
      penalty_alpha: 0,
      num_beams: 1,
      streaming: true,
    });
    expect(imported.base).toEqual({
      temperature: 0.7,
      top_p: 1,
      top_k: 0,
      repetition_penalty: 1.05,
      max_tokens: 350,
      context_tokens: 16384,
    });
    expect(imported.samplers).toEqual({
      repetition_penalty_range: 2048,
      min_p: 0.05,
      dry_multiplier: 0.8,
      dry_sequence_breakers: ['\n', ':'],
      xtc_probability: 0.5,
      banned_strings: ['As an AI', 'I cannot'],
    });
    expect(imported.unmapped).toEqual(['num_beams', 'penalty_alpha', 'streaming']);
  });

  it('reads a chat-completion preset and says what it leaves out', () => {
    const imported = presetFromSillyTavern({
      temperature: 1.2,
      frequency_penalty: 0.4,
      presence_penalty: 0.2,
      openai_max_tokens: 600,
      openai_max_context: 99_999_999,
      seed: 7,
      prompts: [],
      wrap_in_quotes: false,
    });
    expect(imported.base).toEqual({ temperature: 1.2, max_tokens: 600 });
    expect(imported.samplers).toEqual({ frequency_penalty: 0.4, presence_penalty: 0.2, seed: 7 });
    expect(imported.unmapped).toEqual(['openai_max_context', 'prompts', 'wrap_in_quotes']);
    expect(importedBase(imported)).toEqual({ ...PRESET_DEFAULTS, temperature: 1.2, max_tokens: 600 });
  });

  it('turns dynamic temperature’s min and max into a range around the temperature', () => {
    const imported = presetFromSillyTavern({ dynatemp: true, min_temp: 0.5, max_temp: 1.5, dynatemp_exponent: 1.5 });
    expect(imported.samplers).toEqual({ dynatemp_range: 0.5, dynatemp_exponent: 1.5 });
    expect(imported.base.temperature).toBe(1);
  });

  it('keeps nothing from something that isn’t a preset', () => {
    expect(presetFromSillyTavern('nope')).toEqual({ base: {}, samplers: {}, unmapped: [] });
  });
});
