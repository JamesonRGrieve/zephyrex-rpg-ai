// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { writeImportedChat } from './importChat';

describe('writeImportedChat', () => {
  it('writes the turns as a chain, the character’s with the speaker set', async () => {
    const written: unknown[] = [];
    let next = 0;
    const result = await writeImportedChat(
      {
        characterName: 'Ada',
        userName: 'Sam',
        turns: [
          { role: 'character', name: 'Ada', swipes: ['Hi.', 'Hello.'], swipe_index: 1 },
          { role: 'user', name: 'Sam', swipes: ['I wave.'], swipe_index: 0 },
        ],
      },
      'c-ada',
      {
        createChat: async (fields) => {
          written.push(fields);
          return { id: 'chat' };
        },
        createMessage: async (fields) => {
          written.push(fields);
          next += 1;
          return { id: `m${next}` };
        },
      },
    );
    expect(result).toEqual({ id: 'chat', messages: 2 });
    expect(written).toEqual([
      { title: 'Chat with Ada (imported)', character_ids: ['c-ada'] },
      {
        chat_id: 'chat',
        parent_id: null,
        role: 'character',
        speaker_character_id: 'c-ada',
        swipes: ['Hi.', 'Hello.'],
        swipe_index: 1,
      },
      { chat_id: 'chat', parent_id: 'm1', role: 'user', speaker_character_id: null, swipes: ['I wave.'], swipe_index: 0 },
    ]);
  });
});
