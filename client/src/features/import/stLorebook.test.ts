// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { characterBookFromEntries, lorebookFromJson, lorebookToJson } from './stLorebook';

const WORLD_INFO = {
  name: 'Kestrel',
  entries: {
    '0': {
      uid: 0,
      key: ['spanner', 'wrench'],
      keysecondary: ['engine'],
      comment: 'Tools',
      content: 'The spanners are cursed.',
      selectiveLogic: 3,
      order: 50,
      position: 4,
      depth: 2,
      role: 1,
      disable: false,
      probability: 40,
      useProbability: true,
      group: 'tools',
      groupWeight: 250,
      groupOverride: true,
      sticky: 2,
      cooldown: 3,
      delay: 1,
      excludeRecursion: true,
      caseSensitive: true,
      matchWholeWords: null,
      characterFilter: { names: ['Ada'], isExclude: true },
    },
    '1': { uid: 1, key: 'harbour, dock', content: 'Ships dock here.', position: 6, disable: true, probability: 10, useProbability: false },
  },
};

describe('SillyTavern lorebooks', () => {
  it('reads a World Info file with its numeric codes', () => {
    const book = lorebookFromJson(WORLD_INFO, 'fallback');
    expect(book.name).toBe('Kestrel');
    expect(book.entries[0]).toMatchObject({
      comment: 'Tools',
      keys: ['spanner', 'wrench'],
      secondary_keys: ['engine'],
      selective_logic: 'and_all',
      position: 'at_depth',
      depth: 2,
      role: 'user',
      order: 50,
      probability: 40,
      group: 'tools',
      group_weight: 250,
      prioritize: true,
      sticky: 2,
      cooldown: 3,
      delay: 1,
      exclude_recursion: true,
      case_sensitive: true,
      match_whole_words: null,
      character_names: ['Ada'],
      character_exclude: true,
    });
    // A comma-separated key string, after-examples position, disabled, and probability left off.
    expect(book.entries[1]).toMatchObject({ keys: ['harbour', 'dock'], position: 'after_example', enabled: false, probability: 100 });
  });

  it('reads a card’s character_book, with SillyTavern’s extras in extensions', () => {
    const card = {
      spec: 'chara_card_v2',
      data: {
        name: 'Ada',
        character_book: {
          name: 'Ada’s past',
          entries: [
            { keys: ['forge'], content: 'She grew up at a forge.', insertion_order: 7, enabled: true, position: 'before_char', extensions: { depth: 9, probability: 60, useProbability: true } },
          ],
        },
      },
    };
    const book = lorebookFromJson(card, 'Ada');
    expect(book.name).toBe('Ada’s past');
    expect(book.entries).toEqual([
      expect.objectContaining({ keys: ['forge'], order: 7, position: 'before_char', depth: 9, probability: 60, enabled: true }),
    ]);
  });

  it('writes a World Info file that reads back the same', () => {
    const book = lorebookFromJson(WORLD_INFO, 'x');
    const again = lorebookFromJson(lorebookToJson({ name: book.name, description: '' }, book.entries), 'x');
    expect(again.entries).toEqual(book.entries);
  });

  it('keeps numbers inside the contract’s ranges, and refuses a file with no entries', () => {
    const book = lorebookFromJson({ entries: { '0': { key: ['x'], probability: 400, depth: -5 } } }, 'x');
    expect(book.entries[0]).toMatchObject({ probability: 100, depth: 0 });
    expect(() => lorebookFromJson({ entries: {} }, 'x')).toThrow('This file has no lorebook entries');
  });

  it('writes a card book that reads back the same, at depth and all', () => {
    const book = lorebookFromJson(WORLD_INFO, 'x');
    const card = { spec: 'chara_card_v2', data: { name: 'Ada', character_book: characterBookFromEntries({ name: 'Kestrel', description: '' }, book.entries) } };
    expect(lorebookFromJson(card, 'Ada').entries).toEqual(book.entries);
  });
});
