// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { LIMITS } from '~/contract';
import { chats } from './rpgRecords';

describe('a chat’s variables (macros and STscript, audit gap 1)', () => {
  it('starts with none, and keeps names to text', () => {
    expect(chats.createSchema.parse({ title: 'Chat', character_ids: ['3f2b8c4e-1d2a-4b5c-8e9f-0a1b2c3d4e5f'] }).variables).toEqual({});
    expect(chats.updateSchema.parse({ variables: { mood: 'grim', hp: '12' } }).variables).toEqual({ mood: 'grim', hp: '12' });
  });

  it('refuses a value that isn’t text, a value too long, and too many', () => {
    expect(chats.updateSchema.safeParse({ variables: { hp: 12 } }).success).toBe(false);
    expect(chats.updateSchema.safeParse({ variables: { note: 'x'.repeat(LIMITS.variable_value_characters + 1) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: LIMITS.chat_variables + 1 }, (_unused, index) => [`v${index}`, '1']));
    expect(chats.updateSchema.safeParse({ variables: many }).success).toBe(false);
  });
});
