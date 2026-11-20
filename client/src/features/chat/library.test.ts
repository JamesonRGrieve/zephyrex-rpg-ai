// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { chatMatches, foldersOf, inFolder, parseTags } from './library';

const HEIST = { title: 'The Vell job', tags: ['heist'], folder: 'Kestrel', character_ids: ['c1'] };
const LOOSE = { title: 'Tea with Bram', tags: [], folder: '', character_ids: ['c2'] };
const NAMES = new Map([
  ['c1', 'Ada Vance'],
  ['c2', 'Bram'],
]);

describe('the chat library', () => {
  it('finds a chat by title, tag or a cast member’s name, ignoring case', () => {
    expect(chatMatches(HEIST, NAMES, 'vell')).toBe(true);
    expect(chatMatches(HEIST, NAMES, 'HEIST')).toBe(true);
    expect(chatMatches(HEIST, NAMES, 'ada')).toBe(true);
    expect(chatMatches(LOOSE, NAMES, 'ada')).toBe(false);
    expect(chatMatches(LOOSE, NAMES, '  ')).toBe(true);
  });

  it('filters by folder, or by none', () => {
    expect([HEIST, LOOSE].filter((chat) => inFolder(chat, { kind: 'folder', name: 'Kestrel' }))).toEqual([HEIST]);
    expect([HEIST, LOOSE].filter((chat) => inFolder(chat, { kind: 'none' }))).toEqual([LOOSE]);
    expect(foldersOf([HEIST, LOOSE, { ...LOOSE, folder: 'Archive' }])).toEqual(['Archive', 'Kestrel']);
  });

  it('reads typed tags', () => {
    expect(parseTags(' heist, , Vell,heist ')).toEqual(['heist', 'Vell']);
  });
});
