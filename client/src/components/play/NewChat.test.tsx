// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { chatTitle } from './NewChat';

describe('chatTitle', () => {
  it('names a chat by its cast', () => {
    expect(chatTitle([{ name: 'Ada' }])).toBe('Chat with Ada');
    expect(chatTitle([{ name: 'Ada' }, { name: 'Bram' }])).toBe('Ada and Bram');
    expect(chatTitle([{ name: 'Ada' }, { name: 'Bram' }, { name: 'Cy' }, { name: 'Di' }])).toBe('Ada, Bram and 2 more');
    expect(chatTitle([])).toBe('Chat with a character');
  });
});
