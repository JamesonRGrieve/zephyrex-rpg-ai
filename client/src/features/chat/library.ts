// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Finding a chat in the library (A12): by its title, its cast's names or its tags, and by folder.
 * Pure.
 */

export interface LibraryChat {
  title: string;
  tags: readonly string[];
  folder: string;
  character_ids: readonly string[];
}

/** The folder filter: every chat, one folder, or the chats in none. */
export type FolderFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string };

/** Whether `chat` matches the search, ignoring case: title, cast names or tags. */
export function chatMatches(chat: LibraryChat, castNames: ReadonlyMap<string, string>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [chat.title, ...chat.tags, ...chat.character_ids.map((id) => castNames.get(id) ?? '')].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

export function inFolder(chat: LibraryChat, filter: FolderFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'none') return chat.folder === '';
  return chat.folder === filter.name;
}

/** Every folder in use, sorted, each once. */
export function foldersOf(chats: readonly LibraryChat[]): string[] {
  return [...new Set(chats.map((chat) => chat.folder).filter((folder) => folder !== ''))].sort((a, b) => a.localeCompare(b));
}

/** Tags typed as a comma-separated list: trimmed, empties dropped, each once. */
export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

export interface FoundLine {
  chatId: string;
  messageId: string;
  /** The line around the match. */
  excerpt: string;
}

/** The lines of `messages` that say `query` (ignoring case; three characters or more), newest first. */
export function searchMessages(
  messages: readonly { id: string; chat_id: string; swipes: readonly string[]; swipe_index: number; created_at: string }[],
  query: string,
  limit = 20,
): FoundLine[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 3) return [];
  return [...messages]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((message) => {
      const text = message.swipes[message.swipe_index] ?? '';
      const at = text.toLowerCase().indexOf(needle);
      if (at === -1) return [];
      const start = Math.max(0, at - 40);
      const end = Math.min(text.length, at + needle.length + 60);
      return [
        {
          chatId: message.chat_id,
          messageId: message.id,
          excerpt: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
        },
      ];
    })
    .slice(0, limit);
}
