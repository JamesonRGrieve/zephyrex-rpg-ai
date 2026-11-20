// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { matchesSearch, tagsOf } from './CharacterGallery';

const ADA = { name: 'Ada Vance', tags: ['Sci-Fi'], description: 'An engineer.' };

describe('matchesSearch', () => {
  it('matches the name, a tag or the description, ignoring case and spaces', () => {
    expect(matchesSearch(ADA, '')).toBe(true);
    expect(matchesSearch(ADA, ' vance ')).toBe(true);
    expect(matchesSearch(ADA, 'sci-fi')).toBe(true);
    expect(matchesSearch(ADA, 'ENGINEER')).toBe(true);
    expect(matchesSearch(ADA, 'wizard')).toBe(false);
  });
});

describe('tagsOf', () => {
  it('lists each tag once, the most used first, then by name', () => {
    expect(tagsOf([{ tags: ['crew', 'pilot'] }, { tags: ['crew'] }, { tags: ['cook'] }])).toEqual(['crew', 'cook', 'pilot']);
  });
});
