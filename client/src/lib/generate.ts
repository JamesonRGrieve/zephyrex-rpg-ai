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
import { type EndpointApi, type InstructTemplateId, LIMITS, LORE, PRESET_DEFAULTS, PROMPT } from '~/contract';
import { branchTo } from '~/features/chat/branch';
import { activateLore, type LoreEntry, type LoreSettings, type LoreState } from '~/features/lore/activate';
import { type AssembledPrompt, assemblePrompt, type CampaignFrame, type ScenarioView, estimateTokens, summaryPrompt, tableGmPrompt, type TableNote, translatePrompt, type ModelMessage, type PromptInput, type PromptMode, type PromptSection, type PromptTurn } from '~/features/prompt/assemble';
import { instructStops, renderInstruct } from '~/features/prompt/instruct';
import type { RegexScript } from '~/features/chat/regex';
import { regexScripts } from '~/lib/regexRecords';
import { dataBankText } from '~/features/chat/dataBank';
import { campaigns, scenarios } from '~/lib/campaignRecords';
import { lorebookEntries } from '~/lib/loreRecords';
import { completionDeltas } from '~/lib/completionStream';
import { prisma } from '~/lib/prisma';
import { chatMessages, chats, characters, endpoints, personas, presets } from '~/lib/rpgRecords';

const request = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  speaker_id: z.string().min(1).nullable().default(null),
  mode: z.enum(['reply', 'continue', 'impersonate', 'table', 'narrate']).default('reply'),
});

const NO_QUERY = new URLSearchParams();

export interface Sampler {
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
  max_tokens: number;
  context_tokens: number;
  stop: string[];
  prompt_layout: PromptSection[];
}

export interface Endpoint {
  base_url: string;
  model: string;
  api_key: string;
  api: EndpointApi;
  instruct_template: InstructTemplateId;
}

/** Everything a reply needs, read as the owner sees it. */
export async function generationInputs(
  ownerId: string,
  body: z.infer<typeof request>,
  roll: () => number = Math.random,
): Promise<{ prompt: PromptInput; sampler: Sampler; endpoint: Endpoint; loreState: LoreState; activeLore: string[]; images: string[]; paused: boolean }> {
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
    system_prompt: string;
    summary: string;
    objectives: { text: string; done: boolean }[];
    content_rating: string | null;
    lines: string[];
    veils: string[];
    table_notes: TableNote[];
    paused: boolean;
    campaign_id: string | null;
    scenario_id: string | null;
  };

  const cast = await prisma.character.findMany({ where: { createdById: ownerId, id: { in: chatFields.character_ids } } });
  const ordered = chatFields.character_ids.flatMap((id) => cast.filter((character) => character.id === id));
  const promptCharacters = ordered.map((row) => ({ id: row.id, ...(characters.fields(row) as Omit<PromptInput['characters'][number], 'id'>) }));
  // Narrating (A20), the GM speaks, so no character is named as the speaker.
  const speakerId = body.mode === 'narrate' ? '' : (body.speaker_id ?? promptCharacters[0]?.id);
  if (speakerId === undefined || (body.mode !== 'narrate' && !promptCharacters.some((character) => character.id === speakerId))) {
    throw validationError('The speaker must be a character in the chat', 'speaker_id');
  }

  const personaRow =
    chatFields.persona_id === null
      ? await prisma.persona.findFirst({ where: { createdById: ownerId, isDefault: true } })
      : await personas.find(chatFields.persona_id, ownerId);
  const persona = personaRow === null ? null : { name: personaRow.name, description: personaRow.description };

  const messages = (await chatMessages.list(ownerId, new URLSearchParams({ chat_id: chat.id }))).map((row) => ({
    id: row.id,
    ...(chatMessages.fields(row) as { parent_id: string | null; role: PromptTurn['role']; channel: string; speaker_character_id: string | null; swipes: string[]; swipe_index: number; images: string[]; x_carded: boolean }),
  }));
  if (body.leaf_id !== null && !messages.some((message) => message.id === body.leaf_id)) {
    throw validationError('The leaf must be a message in the chat', 'leaf_id');
  }
  const path = body.leaf_id === null ? [] : branchTo(messages, body.leaf_id);
  // The newest line's pictures go to a vision model (A44); older ones stay in the chat only.
  const leafMessage = path.at(-1);
  const images = leafMessage !== undefined && leafMessage.role === 'user' && leafMessage.channel === 'ic' ? leafMessage.images : [];
  const history: PromptTurn[] = path.map((message) => ({
    role: message.role,
    channel: message.channel,
    speaker_character_id: message.speaker_character_id,
    content: message.swipes[message.swipe_index] ?? '',
    x_carded: message.x_carded,
  }));

  // World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
  const story = new Set<string>(PROMPT.story_channels);
  // What lore and the data bank scan: the story, less what the table X-carded (A25).
  const storyTexts = history.filter((turn) => story.has(turn.channel) && turn.x_carded !== true).map((turn) => turn.content);
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
  const sampler: Sampler = presetRow === null ? { ...PRESET_DEFAULTS, stop: [], prompt_layout: [] } : (presets.fields(presetRow) as unknown as Sampler);

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
      mode: body.mode === 'table' ? 'reply' : body.mode,
      layout: sampler.prompt_layout,
      system_prompt: chatFields.system_prompt,
      summary: chatFields.summary,
      objective: chatFields.objectives.find((one) => !one.done)?.text ?? '',
      safety: { content_rating: chatFields.content_rating, lines: chatFields.lines, veils: chatFields.veils },
      table_notes: chatFields.table_notes,
      frame: chatFields.campaign_id === null ? null : await campaignFrame(ownerId, chatFields.campaign_id),
      scenario: chatFields.scenario_id === null ? null : await runningScenario(ownerId, chatFields.scenario_id),
      data_bank: dataBankText(await dataBankDocuments(ownerId, chat.id, chatFields.character_ids), storyTexts),
      regex: (await regexScripts.list(ownerId, NO_QUERY)).map((row) => regexScripts.fields(row) as unknown as RegexScript),
    },
    sampler,
    endpoint: {
      base_url: endpointRow.baseUrl,
      model: endpointRow.model,
      api_key: endpointRow.apiKey,
      api: endpointRow.api as EndpointApi,
      instruct_template: endpointRow.instructTemplate as InstructTemplateId,
    },
    loreState: lore.state,
    activeLore: lore.active,
    images,
    paused: chatFields.paused,
  };
}

/** A chat's campaign frame (A57), as frameText reads it; none when the campaign is gone. */
async function campaignFrame(ownerId: string, campaignId: string): Promise<CampaignFrame | null> {
  const row = await campaigns.find(campaignId, ownerId);
  return row === null ? null : (campaigns.fields(row) as unknown as CampaignFrame);
}

/** The scenario a chat runs (A59, A60), as scenarioText reads it; none when it is gone. */
async function runningScenario(ownerId: string, scenarioId: string): Promise<ScenarioView | null> {
  const row = await scenarios.find(scenarioId, ownerId);
  return row === null ? null : (scenarios.fields(row) as unknown as ScenarioView);
}

/** The data bank's documents for a chat (A41): everyone's, the chat's own and its cast's. */
async function dataBankDocuments(ownerId: string, chatId: string, characterIds: readonly string[]): Promise<string[]> {
  const rows = await prisma.dataDocument.findMany({
    where: {
      createdById: ownerId,
      OR: [{ scope: 'global' }, { scope: 'chat', scopeId: chatId }, { scope: 'character', scopeId: { in: [...characterIds] } }],
    },
    orderBy: { name: 'asc' },
  });
  // In the server's order: everyone's, then the chat's, then each cast member's in turn.
  const rank = (row: (typeof rows)[number]) => (row.scope === 'global' ? -2 : row.scope === 'chat' ? -1 : characterIds.indexOf(row.scopeId ?? ''));
  return rows.sort((a, b) => rank(a) - rank(b)).map((row) => row.text);
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
export function completionsUrl(baseUrl: string, api: EndpointApi = 'chat'): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = api === 'chat' ? '/chat/completions' : '/completions';
  return base.endsWith(path) ? base : `${base.replace(/\/(chat\/)?completions$/, '')}${path}`;
}

/**
 * The messages with `images` added to the last user message as OpenAI-style content parts (A44),
 * for a vision model; unchanged when there are none. A text API never gets them.
 */
export function withImages(messages: readonly ModelMessage[], images: readonly string[]): unknown[] {
  if (images.length === 0) return [...messages];
  const last = messages.findLastIndex((message) => message.role === 'user');
  return messages.map((message, index) =>
    index === last
      ? { role: message.role, content: [{ type: 'text', text: message.content }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] }
      : message,
  );
}

/**
 * What the model endpoint is sent: the messages for a chat API, or for a text API one prompt in
 * the endpoint's instruct template (a continued reply left open), with its stop strings added.
 */
export function upstreamBody(endpoint: Endpoint, sampler: Sampler, messages: readonly ModelMessage[], mode: PromptMode, images: readonly string[] = []): Record<string, unknown> {
  const text = endpoint.api === 'text';
  const stop = [...sampler.stop, ...(text ? instructStops(endpoint.instruct_template) : [])];
  return {
    model: endpoint.model,
    ...(text ? { prompt: renderInstruct(messages, endpoint.instruct_template, mode === 'continue') } : { messages: withImages(messages, images) }),
    stream: true,
    temperature: sampler.temperature,
    top_p: sampler.top_p,
    top_k: sampler.top_k,
    repetition_penalty: sampler.repetition_penalty,
    max_tokens: sampler.max_tokens,
    ...(stop.length === 0 ? {} : { stop }),
  };
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' };

function event(name: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** What the model reads for `mode`: the story prompt, or the table GM's (A11, A20). */
function promptFor(mode: z.infer<typeof request>['mode'], prompt: PromptInput): AssembledPrompt {
  return mode === 'table' ? tableGmPrompt(prompt) : assemblePrompt(prompt);
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
    const assembled = promptFor(body.mode, prompt);
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

/** The endpoint's answer to `body`, or the framework's 502 when it cannot be reached or refuses. */
async function askModel(endpoint: Endpoint, body: Record<string, unknown>, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const upstream = await fetch(completionsUrl(endpoint.base_url, endpoint.api), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(endpoint.api_key === '' ? {} : { Authorization: `Bearer ${endpoint.api_key}` }),
    },
    body: JSON.stringify(body),
    signal,
  }).catch(() => {
    throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
  });
  if (!upstream.ok || upstream.body === null) {
    throw new ApiError(502, { message: `The model endpoint answered ${upstream.status}`, code: 'model_refused' });
  }
  return upstream.body;
}

/** Every delta of a stream, joined. */
async function collect(deltas: AsyncGenerator<string>): Promise<string> {
  const next = await deltas.next();
  return next.done ? '' : next.value + (await collect(deltas));
}

/**
 * `POST /v1/ai_chat/summarize` (A19): a summary of the branch so far, written by the chat's model.
 * Nothing is written: the person keeps or edits it and saves it to the chat like any other change.
 */
export async function summarize(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, endpoint } = await generationInputs(owner.id, body);
    const asked = summaryPrompt(prompt);
    const stream = await askModel(endpoint, upstreamBody(endpoint, sampler, asked.messages, 'reply'), nextRequest.signal);
    const text = await collect(completionDeltas(stream)).catch(() => {
      throw new ApiError(502, { message: 'The model stopped mid-summary', code: 'model_refused' });
    });
    return Response.json({ summary: { text: text.trim(), dropped: asked.dropped } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const translateRequest = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1).max(LIMITS.translate_characters),
  language: z.string().min(1).max(LIMITS.language_characters),
});

/**
 * `POST /v1/ai_chat/translate` (A43): a message translated by the chat's model, for display only.
 * The answer echoes the request with the translation as its text.
 */
export async function translate(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = translateRequest.safeParse(Reflect.get(envelope, 'translate'));
    if (!parsed.success) throw validationError('A translate object with a chat_id, text and language is required', 'translate');
    const asked = parsed.data;
    const { sampler, endpoint } = await generationInputs(owner.id, { chat_id: asked.chat_id, leaf_id: null, speaker_id: null, mode: 'reply' });
    const stream = await askModel(endpoint, upstreamBody(endpoint, sampler, translatePrompt(asked.text, asked.language), 'reply'), nextRequest.signal);
    const text = await collect(completionDeltas(stream)).catch(() => {
      throw new ApiError(502, { message: 'The model stopped mid-translation', code: 'model_refused' });
    });
    return Response.json({ translate: { ...asked, text: text.trim() } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function generate(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, endpoint, loreState, images, paused } = await generationInputs(owner.id, body);
    // Paused (A25): no story turns until the table resumes. The table GM still answers.
    if (paused && body.mode !== 'table') throw new ApiError(409, { message: 'The table has paused the game', code: 'paused' });
    const assembled = promptFor(body.mode, prompt);
    // The lore timers move with the reply that read them.
    await saveLoreState(owner.id, body.chat_id, loreState);

    const upstream = await askModel(endpoint, upstreamBody(endpoint, sampler, assembled.messages, body.mode === 'table' ? 'reply' : body.mode, images), nextRequest.signal);
    const deltas = completionDeltas(upstream);
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
