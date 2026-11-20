// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading the reply stream `POST /v1/ai_chat/generate` answers (lib/generate.ts): server-sent
 * events named `delta` (`{ text }`), `done` (`{ dropped }`) and `error` (`{ detail }`).
 */

export type ReplyEvent =
  { type: 'delta'; text: string } | { type: 'done'; dropped: number } | { type: 'error'; detail: string };

/** One event block (`event:` and `data:` lines); null when it is not one of ours. */
export function parseEventBlock(block: string): ReplyEvent | null {
  let name = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim());
  }
  let body: unknown;
  try {
    body = JSON.parse(data.join('\n'));
  } catch {
    return null;
  }
  const field = (key: string): unknown => Reflect.get(Object(body), key);
  if (name === 'delta' && typeof field('text') === 'string') return { type: 'delta', text: field('text') as string };
  if (name === 'done')
    return { type: 'done', dropped: typeof field('dropped') === 'number' ? (field('dropped') as number) : 0 };
  if (name === 'error')
    return { type: 'error', detail: typeof field('detail') === 'string' ? (field('detail') as string) : 'The reply failed' };
  return null;
}

/** The complete blocks in `buffer` (separated by a blank line), and the unfinished rest. */
export function takeBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { blocks: parts.filter((part) => part.trim() !== ''), rest };
}
