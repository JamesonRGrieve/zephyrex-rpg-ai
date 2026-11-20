// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern chats in and out (features A13 and A56): ST's JSONL chat file, whose first line is
 * the chat's header (`user_name`, `character_name`, `create_date`, `chat_metadata`) and every
 * other line one message (`name`, `is_user`, `is_system`, `send_date`, `mes`, and its `swipes`
 * with `swipe_id`). Pure: text in, turns out, and a file back; the importer writes the turns as a
 * chain of messages.
 */

export type ImportedRole = 'user' | 'character' | 'narrator';

export interface ImportedTurn {
  role: ImportedRole;
  /** Who said it, as the file names them. */
  name: string;
  swipes: string[];
  swipe_index: number;
}

export interface ImportedChat {
  characterName: string;
  userName: string;
  turns: ImportedTurn[];
}

export class ChatFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatFileError';
  }
}

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function turnOf(line: Record<string, unknown>): ImportedTurn | null {
  const message = text(line.mes);
  const swipes = Array.isArray(line.swipes) ? line.swipes.filter((swipe): swipe is string => typeof swipe === 'string') : [];
  const all = swipes.length > 0 ? swipes : [message];
  if (all.every((swipe) => swipe === '')) return null;
  const chosen =
    typeof line.swipe_id === 'number' && line.swipe_id >= 0 && line.swipe_id < all.length
      ? line.swipe_id
      : Math.max(0, all.indexOf(message));
  const role: ImportedRole = line.is_user === true ? 'user' : line.is_system === true ? 'narrator' : 'character';
  return { role, name: text(line.name), swipes: all, swipe_index: chosen };
}

export function chatFromJsonl(file: string): ImportedChat {
  const lines = file
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return object(JSON.parse(line) as unknown);
      } catch {
        throw new ChatFileError('This is not a SillyTavern chat file (each line must be JSON)');
      }
    });
  const [header, ...rest] = lines;
  if (header === undefined || !('character_name' in header || 'user_name' in header)) {
    throw new ChatFileError('This is not a SillyTavern chat file (it has no header line)');
  }
  return {
    characterName: text(header.character_name),
    userName: text(header.user_name),
    turns: rest.flatMap((line) => {
      const turn = turnOf(line);
      return turn === null ? [] : [turn];
    }),
  };
}

export interface ExportedMessage {
  role: 'user' | 'character' | 'narrator' | 'system';
  name: string;
  swipes: string[];
  swipe_index: number;
  created_at: string;
}

/** A branch as a SillyTavern chat file. */
export function chatToJsonl(
  header: { characterName: string; userName: string; createdAt: string },
  messages: readonly ExportedMessage[],
): string {
  const lines: unknown[] = [
    { user_name: header.userName, character_name: header.characterName, create_date: header.createdAt, chat_metadata: {} },
    ...messages.map((message) => ({
      name: message.name,
      is_user: message.role === 'user',
      is_system: message.role === 'narrator' || message.role === 'system',
      send_date: message.created_at,
      mes: message.swipes[message.swipe_index] ?? '',
      swipes: message.swipes,
      swipe_id: message.swipe_index,
    })),
  ];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

/** A branch as plain text, one turn a paragraph: "Name: what they said". */
export function chatToText(messages: readonly Pick<ExportedMessage, 'name' | 'swipes' | 'swipe_index'>[]): string {
  return `${messages.map((message) => `${message.name}: ${message.swipes[message.swipe_index] ?? ''}`).join('\n\n')}\n`;
}
