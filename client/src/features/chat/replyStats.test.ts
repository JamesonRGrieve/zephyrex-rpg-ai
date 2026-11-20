// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PROMPT } from '~/contract';
import { replyStats, statsLabel, timed } from './replyStats';

describe('replyStats', () => {
  it('estimates tokens as the prompt does, and keeps the time', () => {
    const text = 'x'.repeat(PROMPT.characters_per_token * 10 + 1);
    expect(replyStats(`  ${text}  `, 4.24)).toEqual({ tokens: 11, seconds: 4.24 });
    expect(replyStats('', -1)).toEqual({ tokens: 0, seconds: 0 });
  });

  it('says it in a few words', () => {
    expect(statsLabel({ tokens: 120, seconds: 4.24 })).toBe('About 120 tokens · 4.2 s');
    expect(statsLabel({ tokens: 1, seconds: 75.4 })).toBe('About 1 token · 75 s');
  });

  it('times a piece of work', async () => {
    const { value, seconds } = await timed(async () => 'done');
    expect(value).toBe('done');
    expect(seconds).toBeGreaterThanOrEqual(0);
  });
});
