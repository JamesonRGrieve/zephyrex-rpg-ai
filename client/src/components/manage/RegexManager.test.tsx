// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { targetOf } from './RegexManager';

describe('targetOf', () => {
  it('names when a script changes the text', () => {
    expect(targetOf({ display_only: false, prompt_only: false })).toBe('stored');
    expect(targetOf({ display_only: true, prompt_only: false })).toBe('display');
    expect(targetOf({ display_only: false, prompt_only: true })).toBe('prompt');
  });
});
