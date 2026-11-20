// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { regexScripts } from './regexRecords';

describe('regex script checks (as the server makes them)', () => {
  it('fills the defaults', () => {
    expect(regexScripts.createSchema.parse({ name: 'Italics', find: '/\\*(.+?)\\*/g' })).toMatchObject({
      replace: '',
      placements: ['ai_output'],
      display_only: false,
      prompt_only: false,
      min_depth: null,
      max_depth: null,
      enabled: true,
      position: 0,
    });
  });

  it.each([
    ['a pattern that does not compile', { find: '/(/' }],
    ['a flag the twins read differently', { find: '/a/u' }],
    ['no placement', { find: '/a/', placements: [] }],
    ['both display-only and prompt-only', { find: '/a/', display_only: true, prompt_only: true }],
  ])('refuses %s', (_what, fields) => {
    expect(regexScripts.createSchema.safeParse({ name: 'Bad', ...fields }).success).toBe(false);
  });
});
