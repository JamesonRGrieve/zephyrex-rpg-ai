// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { expandMacros } from './macros';

describe('expandMacros', () => {
  it('names the character and the persona in every spelling', () => {
    expect(expandMacros('{{char}} greets {{ USER }}. <BOT> waves at <USER>.', { char: 'Ada', user: 'Sam' })).toBe(
      'Ada greets Sam. Ada waves at Sam.',
    );
  });

  it('leaves other braces alone', () => {
    expect(expandMacros('{{random:a,b}} {char}', { char: 'Ada', user: 'Sam' })).toBe('{{random:a,b}} {char}');
  });
});
