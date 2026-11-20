// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Writes an imported SillyTavern chat as a chat and a chain of messages, one after another so the
 * order holds, through whatever create calls it is given.
 */
import type { ImportedChat } from '~/features/import/stChat';

export interface ChatWriters {
  createChat(fields: { title: string; character_ids: string[] }): Promise<{ id: string }>;
  createMessage(fields: {
    chat_id: string;
    parent_id: string | null;
    role: 'user' | 'character' | 'narrator';
    speaker_character_id: string | null;
    swipes: string[];
    swipe_index: number;
  }): Promise<{ id: string }>;
}

export async function writeImportedChat(chat: ImportedChat, characterId: string, writers: ChatWriters): Promise<{ id: string; messages: number }> {
  const created = await writers.createChat({ title: `Chat with ${chat.characterName || 'a character'} (imported)`, character_ids: [characterId] });
  await chat.turns.reduce<Promise<string | null>>(
    async (previous, turn) => {
      const parent = await previous;
      const message = await writers.createMessage({
        chat_id: created.id,
        parent_id: parent,
        role: turn.role,
        speaker_character_id: turn.role === 'character' ? characterId : null,
        swipes: turn.swipes,
        swipe_index: turn.swipe_index,
      });
      return message.id;
    },
    Promise.resolve(null),
  );
  return { id: created.id, messages: chat.turns.length };
}
