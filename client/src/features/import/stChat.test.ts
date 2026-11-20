// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ChatFileError, chatFromJsonl, chatToJsonl, chatToText } from './stChat';

const FILE = [
  JSON.stringify({ user_name: 'Sam', character_name: 'Ada', create_date: '2026-11-01', chat_metadata: {} }),
  JSON.stringify({ name: 'Ada', is_user: false, mes: 'Hello.', swipes: ['Hi.', 'Hello.'], swipe_id: 1 }),
  JSON.stringify({ name: 'Sam', is_user: true, mes: 'I wave.' }),
  JSON.stringify({ name: 'System', is_system: true, mes: 'The lights flicker.' }),
  JSON.stringify({ name: 'Ada', mes: '' }),
  '',
].join('\n');

describe('SillyTavern chats', () => {
  it('reads the header and each turn, with its swipes and the one shown, skipping empty turns', () => {
    expect(chatFromJsonl(FILE)).toEqual({
      characterName: 'Ada',
      userName: 'Sam',
      turns: [
        { role: 'character', name: 'Ada', swipes: ['Hi.', 'Hello.'], swipe_index: 1 },
        { role: 'user', name: 'Sam', swipes: ['I wave.'], swipe_index: 0 },
        { role: 'narrator', name: 'System', swipes: ['The lights flicker.'], swipe_index: 0 },
      ],
    });
  });

  it('refuses what is not a chat file', () => {
    expect(() => chatFromJsonl('not json')).toThrow(ChatFileError);
    expect(() => chatFromJsonl(JSON.stringify({ name: 'Ada', mes: 'x' }))).toThrow('no header line');
  });

  it('writes a branch that reads back the same', () => {
    const messages = [
      { role: 'character' as const, name: 'Ada', swipes: ['Hi.', 'Hello.'], swipe_index: 1, created_at: '2026-11-01T00:00:00' },
      { role: 'user' as const, name: 'Sam', swipes: ['I wave.'], swipe_index: 0, created_at: '2026-11-01T00:01:00' },
    ];
    const read = chatFromJsonl(chatToJsonl({ characterName: 'Ada', userName: 'Sam', createdAt: '2026-11-01' }, messages));
    expect(read.turns.map((turn) => [turn.role, turn.swipes, turn.swipe_index])).toEqual([
      ['character', ['Hi.', 'Hello.'], 1],
      ['user', ['I wave.'], 0],
    ]);
    expect(chatToText(messages)).toBe('Ada: Hello.\n\nSam: I wave.\n');
  });
});
