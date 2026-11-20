// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { lastActive } from './ChatLibrary';

describe('lastActive', () => {
  const now = new Date('2026-11-20T15:00:00Z');

  it('says today with the time, yesterday, or the date', () => {
    expect(lastActive('2026-11-20T14:05:00.000000', now)).toMatch(/^Today /);
    expect(lastActive('2026-11-19T10:00:00.000000', now)).toBe('Yesterday');
    expect(lastActive('2026-10-01T10:00:00.000000', now)).toBe(new Date('2026-10-01T10:00:00Z').toLocaleDateString());
  });

  it('says nothing for a missing or unreadable stamp', () => {
    expect(lastActive(null, now)).toBe('');
    expect(lastActive('not a time', now)).toBe('');
  });
});
