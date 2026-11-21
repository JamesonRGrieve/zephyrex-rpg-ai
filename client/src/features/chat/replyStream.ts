// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading the reply stream `POST /v1/ai_chat/generate` answers (lib/generate.ts): server-sent
 * events named `delta` (`{ text }`), `done` (`{ dropped }`) and `error` (`{ detail }`).
 */

/** One structured line as it streams (docs/DESIGN.md, Structured lines; schema-constrained). */
export interface LiveItem {
  index: number;
  kind: 'narrate' | 'say' | 'do' | 'location';
  speaker: string | null;
  speaker_id: string | null;
  target: string | null;
  manner: string | null;
  text: string;
  done: boolean;
}

/** A message the server saved from a structured turn: each speaker's run is its own. */
export interface SavedLine {
  id: string;
  role: 'narrator' | 'character';
  speaker_character_id: string | null;
  text: string;
}

export type ReplyEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; dropped: number }
  | { type: 'error'; detail: string }
  | { type: 'item_start'; item: Omit<LiveItem, 'text' | 'done'> }
  | { type: 'item_text'; index: number; delta: string }
  | { type: 'item_end'; index: number; text: string }
  | { type: 'person'; name: string; id: string }
  | { type: 'saved'; messages: SavedLine[] };

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

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
    return { type: 'error', detail: text(field('detail')) ?? text(field('message')) ?? 'The reply failed' };
  if (name === 'item_start') {
    const kind = field('kind');
    if (kind !== 'narrate' && kind !== 'say' && kind !== 'do' && kind !== 'location') return null;
    return {
      type: 'item_start',
      item: {
        index: Number(field('index') ?? 0),
        kind,
        speaker: text(field('speaker')),
        speaker_id: text(field('speaker_id')),
        target: text(field('target')),
        manner: text(field('manner')),
      },
    };
  }
  if (name === 'item_text')
    return { type: 'item_text', index: Number(field('index') ?? 0), delta: text(field('delta')) ?? '' };
  if (name === 'item_end') return { type: 'item_end', index: Number(field('index') ?? 0), text: text(field('text')) ?? '' };
  if (name === 'person') {
    const id = text(field('id'));
    const named = text(field('name'));
    return id === null || named === null ? null : { type: 'person', name: named, id };
  }
  if (name === 'saved') {
    const raw = field('messages');
    const messages = (Array.isArray(raw) ? raw : []).flatMap((one): SavedLine[] => {
      const id = text(Reflect.get(Object(one), 'id'));
      const role = Reflect.get(Object(one), 'role');
      if (id === null || (role !== 'narrator' && role !== 'character')) return [];
      return [
        {
          id,
          role,
          speaker_character_id: text(Reflect.get(Object(one), 'speaker_character_id')),
          text: text(Reflect.get(Object(one), 'text')) ?? '',
        },
      ];
    });
    return { type: 'saved', messages };
  }
  return null;
}

/** The complete blocks in `buffer` (separated by a blank line), and the unfinished rest. */
export function takeBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { blocks: parts.filter((part) => part.trim() !== ''), rest };
}
