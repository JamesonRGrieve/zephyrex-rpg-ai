// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { chatMatches, foldersOf, inFolder, parseTags, searchMessages } from './library';

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

describe('searchMessages', () => {
  const MESSAGES = [
    {
      id: 'm1',
      chat_id: 'c1',
      swipes: ['The coolant pump is failing again, Ada says.'],
      swipe_index: 0,
      created_at: '2026-11-01T00:00:00',
    },
    { id: 'm2', chat_id: 'c2', swipes: ['old', 'Mind the COOLANT.'], swipe_index: 1, created_at: '2026-11-02T00:00:00' },
  ];

  it('finds the shown text, ignoring case, newest first, with the line around it', () => {
    expect(searchMessages(MESSAGES, 'coolant')).toEqual([
      { chatId: 'c2', messageId: 'm2', excerpt: 'Mind the COOLANT.' },
      { chatId: 'c1', messageId: 'm1', excerpt: 'The coolant pump is failing again, Ada says.' },
    ]);
  });

  it('waits for three characters', () => {
    expect(searchMessages(MESSAGES, 'co')).toEqual([]);
  });
});
