// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { LIMITS } from '~/contract';
import { parseStops, samplersOf, parseLogitBias } from './PresetManager';

describe('parseStops', () => {
  it('takes one stop string per line, without blanks, up to the limit', () => {
    expect(parseStops(' \nUser:\n\n###\n')).toEqual(['User:', '###']);
    expect(parseStops(Array.from({ length: 40 }, (_, index) => `s${index}`).join('\n'))).toHaveLength(
      LIMITS.preset_stop_strings,
    );
  });

  it('keeps only the sampler settings', () => {
    const saved = {
      ...samplersOf({ temperature: 1, top_p: 1, top_k: 1, repetition_penalty: 1, max_tokens: 1, context_tokens: 512 }),
      id: 'p1',
    };
    expect(Object.keys(samplersOf(saved)).sort()).toEqual([
      'context_tokens',
      'max_tokens',
      'repetition_penalty',
      'temperature',
      'top_k',
      'top_p',
    ]);
  });
});

describe('parseLogitBias', () => {
  it('reads token id: bias lines, keeps biases in range, and leaves out what it cannot read', () => {
    expect(parseLogitBias('50256: -100\n 13 = 5.5\nnonsense\n7: 400')).toEqual({ '50256': -100, '13': 5.5, '7': 100 });
  });
});
