// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Recall by meaning (A19): a chat's older story lines, embedded by a model set to embed, recalled
 * by how close they are to what the story is about now. Pure, and held to
 * contract/memory-cases.json, which the SaaS server's Memory.py runs too.
 *
 * 0. **Lines:** the branch's story turns, each as "Speaker: text" (no OOC, nothing X-carded).
 * 1. **Chunks:** every story line but the last `recent_turns` (those are in the context anyway) is
 *    cut at blank lines into paragraphs, joined (with a blank line) while a chunk stays within
 *    `chunk_characters`; a paragraph longer than that is cut into pieces of that many characters
 *    (code points, as Python counts).
 * 2. **Query:** the last `scan_turns` story lines, one per line.
 * 3. **Recall:** each chunk's cosine similarity to the query; those at `min_similarity` or above, the
 *    closest first (the earlier on a tie), up to `recall` of them and while they fit
 *    `section_tokens`, returned in the story's order under the contract's prefix.
 */
import { MEMORY, PROMPT } from '~/contract';

const BREAK = /\n\s*\n/;
const points = (text: string) => Array.from(text);

export interface StoryLine {
  id: string;
  /** The line as the model would read it, its speaker first ("Ada: Mind the coolant."). */
  text: string;
}

export interface MemoryChunk {
  message_id: string;
  /** The chunk's place within its line, from 0. */
  index: number;
  text: string;
}

export interface Remembered {
  text: string;
  vector: readonly number[];
  /** The chunk's place in the story; the earlier is kept on a tie. */
  order: number;
}

export interface StoryTurn {
  id: string;
  role: string;
  channel: string;
  speaker_character_id: string | null;
  content: string;
  x_carded?: boolean;
}

const STORY = new Set<string>(PROMPT.story_channels);

/**
 * A branch's story as lines to remember, each with its speaker first: the person by their persona's
 * name, a character by theirs, anyone else as the narrator. Out-of-character talk and what the
 * table X-carded (A25) are never remembered.
 */
export function storyLines(
  turns: readonly StoryTurn[],
  userName: string,
  namesById: ReadonlyMap<string, string>,
): StoryLine[] {
  return turns
    .filter((turn) => STORY.has(turn.channel) && turn.x_carded !== true)
    .map((turn) => {
      const name =
        turn.role === 'user'
          ? userName
          : turn.role === 'character'
            ? (namesById.get(turn.speaker_character_id ?? '') ?? PROMPT.narrator_name)
            : PROMPT.narrator_name;
      return { id: turn.id, text: `${name}: ${turn.content}` };
    });
}

/** One line cut into chunks, as the data bank cuts a document. */
function cut(text: string): string[] {
  const limit = MEMORY.chunk_characters;
  const pieces = text
    .split(BREAK)
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .flatMap((paragraph) => {
      const all = points(paragraph);
      return Array.from({ length: Math.ceil(all.length / limit) }, (_unused, index) =>
        all.slice(index * limit, (index + 1) * limit).join(''),
      );
    });
  return pieces.reduce<string[]>((chunks, piece) => {
    const last = chunks.at(-1);
    if (last !== undefined && points(last).length + 2 + points(piece).length <= limit)
      return [...chunks.slice(0, -1), `${last}\n\n${piece}`];
    return [...chunks, piece];
  }, []);
}

/** The chunks a chat remembers: every story line but the most recent ones. */
export function memoryChunks(lines: readonly StoryLine[]): MemoryChunk[] {
  return lines
    .slice(0, Math.max(0, lines.length - MEMORY.recent_turns))
    .flatMap((line) => cut(line.text).map((text, index) => ({ message_id: line.id, index, text })));
}

/** What recall is asked about: the last few story lines. */
export function memoryQuery(lines: readonly StoryLine[]): string {
  return lines
    .slice(-MEMORY.scan_turns)
    .map((line) => line.text)
    .join('\n')
    .trim();
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += (a[index] ?? 0) * (b[index] ?? 0);
    left += (a[index] ?? 0) ** 2;
    right += (b[index] ?? 0) ** 2;
  }
  const norm = Math.sqrt(left) * Math.sqrt(right);
  return norm === 0 ? 0 : dot / norm;
}

/** The tokens a chunk costs in the section, at the contract's ratio. */
const tokensOf = (text: string) => Math.ceil(points(text).length / PROMPT.characters_per_token);

/** The remembered chunks closest to `query`, within the section's budget, in the story's order. */
export function recall(query: readonly number[], remembered: readonly Remembered[]): string[] {
  const close = remembered
    .map((memory) => ({ ...memory, similarity: cosine(query, memory.vector) }))
    .filter((memory) => memory.similarity >= MEMORY.min_similarity)
    .sort((a, b) => b.similarity - a.similarity || a.order - b.order);
  const kept: typeof close = [];
  let spent = tokensOf(MEMORY.prefix);
  for (const memory of close) {
    if (kept.length === MEMORY.recall) break;
    const cost = tokensOf(memory.text) + (kept.length === 0 ? 0 : 1);
    if (spent + cost > MEMORY.section_tokens) continue;
    kept.push(memory);
    spent += cost;
  }
  return kept.sort((a, b) => a.order - b.order).map((memory) => memory.text);
}

/** The prompt section: the recalled chunks under the contract's prefix, or nothing. */
export function memoryText(recalled: readonly string[]): string {
  return recalled.length === 0 ? '' : MEMORY.prefix + recalled.join('\n\n');
}

/** Where a model embeds (OpenAI-compatible `POST /embeddings`), beside its chat completions. */
export function embeddingsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '') + MEMORY.path;
}

export function embeddingsBody(model: string, inputs: readonly string[]): { model: string; input: string[] } {
  return { model, input: [...inputs] };
}

/** The vectors of an `/embeddings` answer, in the order asked; null unless there is one per input. */
export function vectorsOf(answer: unknown, count: number): number[][] | null {
  const data: unknown = Reflect.get(Object(answer), 'data');
  if (!Array.isArray(data) || data.length !== count) return null;
  const vectors: (number[] | undefined)[] = Array.from({ length: count });
  for (const [position, item] of data.entries()) {
    const index: unknown = Reflect.get(Object(item), 'index') ?? position;
    const vector: unknown = Reflect.get(Object(item), 'embedding');
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count) return null;
    if (
      !Array.isArray(vector) ||
      vector.length === 0 ||
      !vector.every((value) => typeof value === 'number' && Number.isFinite(value))
    )
      return null;
    vectors[index] = vector as number[];
  }
  return vectors.every((vector) => vector !== undefined) ? (vectors as number[][]) : null;
}
