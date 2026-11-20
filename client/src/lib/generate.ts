// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `POST /v1/ai_chat/generate`: a character's next reply in one of the owner's chats, streamed.
 * The SaaS server answers the same request the same way through the framework's AI providers.
 *
 * Request: `{ "generate": { "chat_id", "leaf_id", "speaker_id", "mode" } }`. `mode` is `reply` (the
 * default), `continue` (carry on the character's message at `leaf_id`) or `impersonate` (the
 * person's own next line, for the composer). `leaf_id` is the branch the
 * reply follows (null: the chat's start); `speaker_id` is who speaks (null: the chat's first
 * character).
 *
 * Answer: `text/event-stream` of `delta` events (`{ "text" }`), then `done` (`{ "dropped" }`, the
 * history turns left out to fit), or `error` (`{ "detail" }`) if the model fails mid-reply.
 * Refusals before the reply starts are the framework's JSON errors: 404 for a chat that is not the
 * owner's, 409 when no model endpoint is set, 422 for a bad request, 502 when the model refuses.
 *
 * Nothing is saved here: the client adds the finished reply as a message (or a swipe), so a
 * stopped or regenerated reply leaves no trace.
 */
import type { NextRequest } from 'next/server';
import { ApiError, apiErrorResponse, localOwner, notFound, readJsonObject, validationError } from '@zephyrex/lite';
import { z } from 'zod';
import { LORE, PRESET_DEFAULTS, PROMPT } from '~/contract';
import { branchTo } from '~/features/chat/branch';
import { activateLore, type LoreEntry, type LoreSettings, type LoreState } from '~/features/lore/activate';
import { assemblePrompt, estimateTokens, type PromptInput, type PromptTurn } from '~/features/prompt/assemble';
import { lorebookEntries } from '~/lib/loreRecords';
import { completionDeltas } from '~/lib/completionStream';
import { prisma } from '~/lib/prisma';
import { chatMessages, chats, characters, endpoints, personas, presets } from '~/lib/rpgRecords';

const request = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  speaker_id: z.string().min(1).nullable().default(null),
  mode: z.enum(['reply', 'continue', 'impersonate']).default('reply'),
});

const NO_QUERY = new URLSearchParams();

interface Sampler {
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
  max_tokens: number;
  context_tokens: number;
  stop: string[];
}

interface Endpoint {
  base_url: string;
  model: string;
  api_key: string;
}

/** Everything a reply needs, read as the owner sees it. */
export async function generationInputs(
  ownerId: string,
  body: z.infer<typeof request>,
  roll: () => number = Math.random,
): Promise<{ prompt: PromptInput; sampler: Sampler; endpoint: Endpoint; loreState: LoreState; activeLore: string[] }> {
  const chat = await chats.find(body.chat_id, ownerId);
  if (chat === null) throw notFound(chats.modelName);
  const chatFields = chats.fields(chat) as {
    character_ids: string[];
    persona_id: string | null;
    preset_id: string | null;
    endpoint_id: string | null;
    author_note: string;
    lorebook_ids: string[];
    lore_settings: Partial<LoreSettings>;
  };

  const cast = await prisma.character.findMany({ where: { createdById: ownerId, id: { in: chatFields.character_ids } } });
  const ordered = chatFields.character_ids.flatMap((id) => cast.filter((character) => character.id === id));
  const promptCharacters = ordered.map((row) => ({ id: row.id, ...(characters.fields(row) as Omit<PromptInput['characters'][number], 'id'>) }));
  const speakerId = body.speaker_id ?? promptCharacters[0]?.id;
  if (speakerId === undefined || !promptCharacters.some((character) => character.id === speakerId)) {
    throw validationError('The speaker must be a character in the chat', 'speaker_id');
  }

  const personaRow =
    chatFields.persona_id === null
      ? await prisma.persona.findFirst({ where: { createdById: ownerId, isDefault: true } })
      : await personas.find(chatFields.persona_id, ownerId);
  const persona = personaRow === null ? null : { name: personaRow.name, description: personaRow.description };

  const messages = (await chatMessages.list(ownerId, new URLSearchParams({ chat_id: chat.id }))).map((row) => ({
    id: row.id,
    ...(chatMessages.fields(row) as { parent_id: string | null; role: PromptTurn['role']; channel: string; speaker_character_id: string | null; swipes: string[]; swipe_index: number }),
  }));
  if (body.leaf_id !== null && !messages.some((message) => message.id === body.leaf_id)) {
    throw validationError('The leaf must be a message in the chat', 'leaf_id');
  }
  const history: PromptTurn[] = (body.leaf_id === null ? [] : branchTo(messages, body.leaf_id)).map((message) => ({
    role: message.role,
    channel: message.channel,
    speaker_character_id: message.speaker_character_id,
    content: message.swipes[message.swipe_index] ?? '',
  }));

  // World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
  const story = new Set<string>(PROMPT.story_channels);
  const storyTexts = history.filter((turn) => story.has(turn.channel)).map((turn) => turn.content);
  const bookIds = [...new Set([...chatFields.lorebook_ids, ...ordered.flatMap((row) => (row.lorebookId === null ? [] : [row.lorebookId]))])];
  const entryRows = bookIds.length === 0 ? [] : await prisma.lorebookEntry.findMany({ where: { createdById: ownerId, lorebookId: { in: bookIds } } });
  const entries = entryRows.map((row) => ({ id: row.id, ...(lorebookEntries.fields(row) as Omit<LoreEntry, 'id'>) }));
  const stateRow = await prisma.chatLoreState.findUnique({ where: { chatId: chat.id } });
  const priorState: LoreState = stateRow === null ? {} : (JSON.parse(stateRow.state) as LoreState);
  const settings: LoreSettings = {
    scan_depth: LORE.defaults.scan_depth,
    token_budget: LORE.defaults.token_budget,
    recursion_steps: LORE.defaults.recursion_steps,
    case_sensitive: false,
    match_whole_words: false,
    ...chatFields.lore_settings,
  };
  const speakerName = promptCharacters.find((character) => character.id === speakerId)?.name ?? '';
  const lore = activateLore(entries, storyTexts, storyTexts.length, speakerName, priorState, settings, roll);

  const presetRow = chatFields.preset_id === null ? null : await presets.find(chatFields.preset_id, ownerId);
  const sampler: Sampler = presetRow === null ? { ...PRESET_DEFAULTS, stop: [] } : (presets.fields(presetRow) as unknown as Sampler);

  const endpointRow =
    chatFields.endpoint_id === null
      ? ((await prisma.modelEndpoint.findFirst({ where: { createdById: ownerId, isDefault: true } })) ??
        (await endpoints.list(ownerId, NO_QUERY))[0] ??
        null)
      : await endpoints.find(chatFields.endpoint_id, ownerId);
  if (endpointRow === null) throw new ApiError(409, { message: 'Add a model endpoint first', code: 'no_model_endpoint' });

  return {
    prompt: {
      characters: promptCharacters,
      speaker_id: speakerId,
      persona,
      author_note: chatFields.author_note,
      history,
      context_tokens: sampler.context_tokens,
      max_tokens: sampler.max_tokens,
      lore,
      mode: body.mode,
    },
    sampler,
    endpoint: { base_url: endpointRow.baseUrl, model: endpointRow.model, api_key: endpointRow.apiKey },
    loreState: lore.state,
    activeLore: lore.active,
  };
}

/** A chat's lore timers, kept beside the chat so writing them never makes its version stale. */
export async function saveLoreState(ownerId: string, chatId: string, state: LoreState): Promise<void> {
  const text = JSON.stringify(state);
  const stamp = new Date();
  await prisma.chatLoreState.upsert({
    where: { chatId },
    create: { createdById: ownerId, chatId, state: text, updatedAt: stamp },
    update: { state: text, updatedAt: stamp },
  });
}

/** The endpoint's chat-completions URL: its base, with `/chat/completions` once. */
export function completionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' };

function event(name: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** The request's `generate` object, or the framework's 422. */
async function readRequest(nextRequest: NextRequest): Promise<z.infer<typeof request>> {
  const envelope = await readJsonObject(nextRequest);
  const parsed = request.safeParse(Reflect.get(envelope, 'generate'));
  if (!parsed.success) throw validationError('A generate object with a chat_id is required', 'generate');
  return parsed.data;
}

/**
 * `POST /v1/ai_chat/prompt`: the context inspector (A18). Exactly what the model would be given for
 * this request, with each message's estimated tokens, the history dropped to fit, and the lore
 * entries that would go in. A preview: the lore timers do not move and no model is asked.
 */
export async function inspectPrompt(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, activeLore } = await generationInputs(owner.id, body);
    const assembled = assemblePrompt(prompt);
    const messages = assembled.messages.map((message) => ({ ...message, tokens: estimateTokens(message) }));
    return Response.json({
      prompt: {
        messages,
        dropped: assembled.dropped,
        tokens: messages.reduce((total, message) => total + message.tokens, 0),
        context_tokens: sampler.context_tokens,
        max_tokens: sampler.max_tokens,
        active_lore: activeLore,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function generate(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, endpoint, loreState } = await generationInputs(owner.id, body);
    const assembled = assemblePrompt(prompt);
    // The lore timers move with the reply that read them.
    await saveLoreState(owner.id, body.chat_id, loreState);

    const upstream = await fetch(completionsUrl(endpoint.base_url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(endpoint.api_key === '' ? {} : { Authorization: `Bearer ${endpoint.api_key}` }),
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: assembled.messages,
        stream: true,
        temperature: sampler.temperature,
        top_p: sampler.top_p,
        top_k: sampler.top_k,
        repetition_penalty: sampler.repetition_penalty,
        max_tokens: sampler.max_tokens,
        ...(sampler.stop.length === 0 ? {} : { stop: sampler.stop }),
      }),
      signal: nextRequest.signal,
    }).catch(() => {
      throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
    });
    if (!upstream.ok || upstream.body === null) {
      throw new ApiError(502, { message: `The model endpoint answered ${upstream.status}`, code: 'model_refused' });
    }

    const deltas = completionDeltas(upstream.body);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await deltas.next();
          if (next.done) {
            controller.enqueue(event('done', { dropped: assembled.dropped }));
            controller.close();
          } else {
            controller.enqueue(event('delta', { text: next.value }));
          }
        } catch {
          controller.enqueue(event('error', { detail: 'The model stopped mid-reply' }));
          controller.close();
        }
      },
      async cancel() {
        await deltas.return(undefined);
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
