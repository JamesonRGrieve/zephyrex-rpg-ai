// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { namesWithoutLore } from './namesWithoutLore';

describe('namesWithoutLore', () => {
  const story = [
    'We dock at Port Vesna. The Guild owns it.',
    'Ada says the Guild will come. I head for Port Vesna anyway.',
    'When the alarm sounds, Ada runs.',
  ];

  it('lists names seen twice that nothing covers, the most frequent first', () => {
    expect(namesWithoutLore(story, ['Ada Vance', 'Sam'])).toEqual(['Guild', 'Port Vesna']);
  });

  it('skips a word that only ever starts a sentence, names already known, and one-offs', () => {
    expect(namesWithoutLore(story, ['Ada Vance', 'Sam', 'Port Vesna', 'Guild'])).toEqual([]);
    expect(namesWithoutLore(['Cy waved.', 'Then Cy left.'], [])).toEqual(['Cy']);
    expect(namesWithoutLore(['Then Cy left.'], [])).toEqual([]);
  });

  it('counts a name that starts one sentence once it also appears mid-sentence', () => {
    expect(namesWithoutLore(['Kestrel is old.', 'We board the Kestrel.'], [])).toEqual(['Kestrel']);
  });
});
