// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/lore-cases.json';
import { activateLore, keyMatches, type LoreEntry, type LoreSettings, loreTokens } from './activate';

describe('activateLore (contract/lore-cases.json)', () => {
  it.each(cases.cases)('$name', (test) => {
    const draws = [...test.rolls];
    const entries = test.entries.map((entry) => ({ ...cases.defaults, ...entry }) as unknown as LoreEntry);
    const settings = { ...cases.settings, ...('settings' in test ? test.settings : {}) } as LoreSettings;
    const result = activateLore(entries, test.history, test.message_count, test.speaker, test.state, settings, () => draws.shift() ?? 0);
    expect(result).toEqual(test.expect);
  });
});

describe('keyMatches', () => {
  it('treats a broken /regex/ as no match rather than an error', () => {
    expect(keyMatches('/([/i', 'anything', false, false)).toBe(false);
    expect(keyMatches('', 'anything', false, false)).toBe(false);
  });

  it('estimates lore tokens without per-message overhead', () => {
    expect(loreTokens('abcdefgh')).toBe(2);
  });
});
