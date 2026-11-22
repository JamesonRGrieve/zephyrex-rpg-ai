// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { namesIn } from './namesIn';

describe('namesIn', () => {
  it('a line naming one choice names it, article and case aside', () => {
    expect(namesIn('Fennick Quill (at The Barkeep) Stares at the barkeep', 'The Barkeep')).toBe(true);
    expect(namesIn('Stares at the barkeep', 'Sister Maelis Varn')).toBe(false);
  });
  it('a longer name by its given name, past a title', () => {
    expect(namesIn('nods to Maelis', 'Sister Maelis Varn')).toBe(true);
    expect(namesIn('the barkeeper laughs', 'The Barkeep')).toBe(false);
  });
});
