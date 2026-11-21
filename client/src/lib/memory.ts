// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Recall by meaning (A19), lite edition: a chat's older story lines, embedded by the person's model
 * set to embed (the `embed` role) at its OpenAI-compatible `POST /embeddings`, kept as ChatMemory
 * rows, and recalled into the prompt's memories section (features/memory/memory.ts). The SaaS
 * server does the same through the framework's ai_memories (server/extensions/ai_chat/Memory.py).
 *
 * Recall never stops a reply: without a model set to embed, or when it fails, the section is empty.
 * An edited line is embedded again (its digest changed); a line no longer on the branch is forgotten.
 */
import { createHash } from 'node:crypto';
import { MEMORY } from '~/contract';
import {
  embeddingsBody,
  embeddingsUrl,
  memoryChunks,
  memoryQuery,
  memoryText,
  recall,
  type StoryLine,
  vectorsOf,
} from '~/features/memory/memory';
import { prisma } from '~/lib/prisma';
import { endpoints } from '~/lib/rpgRecords';

const NO_QUERY = new URLSearchParams();

const digestOf = (text: string) => createHash('sha256').update(text).digest('hex');

interface Embedder {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** The person's model set to embed: the default first, then by name. */
async function embedderOf(ownerId: string): Promise<Embedder | null> {
  const embedding = (await endpoints.list(ownerId, NO_QUERY))
    .filter((row) => (endpoints.fields(row).roles as string[]).includes('embed'))
    .sort((a, b) => a.name.localeCompare(b.name));
  return embedding.find((row) => row.isDefault) ?? embedding[0] ?? null;
}

async function embed(embedder: Embedder, inputs: readonly string[], signal?: AbortSignal): Promise<number[][] | null> {
  try {
    const answer = await fetch(embeddingsUrl(embedder.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(embedder.apiKey === '' ? {} : { Authorization: `Bearer ${embedder.apiKey}` }),
      },
      body: JSON.stringify(embeddingsBody(embedder.model, inputs)),
      signal,
    });
    if (!answer.ok) return null;
    return vectorsOf(await answer.json(), inputs.length);
  } catch {
    return null;
  }
}

/**
 * The memories section for a chat's branch: its older lines brought up to date (at most
 * `embed_batch` new chunks a turn), then the ones closest to the last lines. Empty, never an error,
 * when recall cannot be had (another reply writing the same memories at once included).
 */
export async function memoriesFor(
  ownerId: string,
  chatId: string,
  lines: readonly StoryLine[],
  signal?: AbortSignal,
): Promise<string> {
  return remembering(ownerId, chatId, lines, signal).catch(() => '');
}

async function remembering(
  ownerId: string,
  chatId: string,
  lines: readonly StoryLine[],
  signal?: AbortSignal,
): Promise<string> {
  const embedder = await embedderOf(ownerId);
  const query = memoryQuery(lines);
  if (embedder === null || query === '') return '';
  const digests = new Map(lines.map((line) => [line.id, digestOf(line.text)]));
  const chunks = memoryChunks(lines);
  const where = { createdById: ownerId, chatId, model: embedder.model };
  const stored = await prisma.chatMemory.findMany({ where });
  const keyOf = (messageId: string, index: number) => `${messageId}\u0000${index}`;
  const wanted = new Map(chunks.map((chunk, order) => [keyOf(chunk.message_id, chunk.index), { chunk, order }]));
  const current = stored.filter((row) => {
    const want = wanted.get(keyOf(row.messageId, row.chunkIndex));
    return want !== undefined && want.chunk.text === row.text && digests.get(row.messageId) === row.digest;
  });
  const stale = stored.filter((row) => !current.includes(row)).map((row) => row.id);
  if (stale.length > 0) await prisma.chatMemory.deleteMany({ where: { id: { in: stale } } });

  const have = new Set(current.map((row) => keyOf(row.messageId, row.chunkIndex)));
  const missing = chunks.filter((chunk) => !have.has(keyOf(chunk.message_id, chunk.index))).slice(0, MEMORY.embed_batch);
  const vectors = await embed(embedder, [query, ...missing.map((chunk) => chunk.text)], signal);
  if (vectors === null) return '';
  const [queryVector, ...newVectors] = vectors;
  if (missing.length > 0) {
    const stamp = new Date();
    await prisma.chatMemory.createMany({
      data: missing.map((chunk, at) => ({
        createdById: ownerId,
        chatId,
        messageId: chunk.message_id,
        chunkIndex: chunk.index,
        digest: digests.get(chunk.message_id) ?? '',
        text: chunk.text,
        model: embedder.model,
        vector: JSON.stringify(newVectors[at]),
        updatedAt: stamp,
      })),
    });
  }
  const remembered = [
    ...current.map((row) => ({
      text: row.text,
      vector: JSON.parse(row.vector) as number[],
      key: keyOf(row.messageId, row.chunkIndex),
    })),
    ...missing.map((chunk, at) => ({
      text: chunk.text,
      vector: newVectors[at] ?? [],
      key: keyOf(chunk.message_id, chunk.index),
    })),
  ].map(({ key, ...memory }) => ({ ...memory, order: wanted.get(key)?.order ?? 0 }));
  return memoryText(recall(queryVector ?? [], remembered));
}

/** Forgets a chat's memories (when the chat is deleted). */
export async function forgetChat(ownerId: string, chatId: string): Promise<void> {
  await prisma.chatMemory.deleteMany({ where: { createdById: ownerId, chatId } });
}
