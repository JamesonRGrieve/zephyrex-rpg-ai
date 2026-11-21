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
import {
  type EndpointApi,
  type EndpointRole,
  type InstructTemplateId,
  HORDE,
  isSearchApi,
  LIMITS,
  LORE,
  PICTURE,
  PRESET_DEFAULTS,
  PROMPT,
} from '~/contract';
import { branchTo } from '~/features/chat/branch';
import { activateLore, type LoreEntry, type LoreSettings, type LoreState } from '~/features/lore/activate';
import {
  type AssembledPrompt,
  assemblePrompt,
  type CampaignFrame,
  expressionPrompt,
  pickOption,
  type ScenarioView,
  backgroundPicturePrompt,
  DEFAULT_USER_NAME,
  portraitPicturePrompt,
  scenePicturePrompt,
  splitReasoning,
  estimateTokens,
  summaryPrompt,
  tableGmPrompt,
  type TableNote,
  translatePrompt,
  type ModelMessage,
  type PromptInput,
  type PromptMode,
  type PromptSection,
  type PromptTurn,
} from '~/features/prompt/assemble';
import { type InstructTemplate, instructStops, renderInstruct } from '~/features/prompt/instruct';
import { ownTemplate } from '~/lib/instructTemplateRecords';
import type { RegexScript } from '~/features/chat/regex';
import { regexScripts } from '~/lib/regexRecords';
import { dataBankText } from '~/features/chat/dataBank';
import { type StoryLine, storyLines } from '~/features/memory/memory';
import { memoriesFor, type Speaker } from '~/lib/memory';
import { samplerParams, type SamplerValues } from '~/features/prompt/samplers';
import { campaigns, scenarios } from '~/lib/campaignRecords';
import { lorebookEntries } from '~/lib/loreRecords';
import { completionDeltas } from '~/lib/completionStream';
import { askDecider, decider } from '~/lib/decider';
import { prisma } from '~/lib/prisma';
import { chatMessages, chats, characters, endpoints, personas, presets } from '~/lib/rpgRecords';

const request = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  speaker_id: z.string().min(1).nullable().default(null),
  mode: z.enum(['reply', 'continue', 'impersonate', 'table', 'narrate']).default('reply'),
  /** AP4: this turn asked of another of the person's models, to compare (kept as another swipe). */
  endpoint_id: z.string().min(1).nullable().default(null),
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
  logit_bias?: Record<string, number>;
  negative_prompt?: string;
  guidance_scale?: number | null;
  /** SillyTavern's further samplers (audit gap 2): only the ones set. */
  samplers?: SamplerValues;
}

export interface Endpoint {
  base_url: string;
  model: string;
  api_key: string;
  api: EndpointApi;
  instruct_template: InstructTemplateId | InstructTemplate;
}

/** Everything a reply needs, read as the owner sees it. */
/** The role a request's model serves (A27). */
export function roleOf(
  mode: z.infer<typeof request>['mode'],
  purpose: 'reply' | 'summary' | 'translate' = 'reply',
): EndpointRole {
  if (purpose !== 'reply') return purpose;
  return mode === 'table' || mode === 'narrate' ? 'gm' : 'story';
}

export async function generationInputs(
  ownerId: string,
  body: z.infer<typeof request>,
  roll: () => number = Math.random,
  purpose: 'reply' | 'summary' | 'translate' = 'reply',
): Promise<{
  prompt: PromptInput;
  sampler: Sampler;
  endpoint: Endpoint;
  loreState: LoreState;
  activeLore: string[];
  images: string[];
  paused: boolean;
  /** The branch's story lines, for recall by meaning (A19, `withMemories`). */
  lines: StoryLine[];
  /** The replying character, whose flag says whether recall reaches its other chats (AP8). */
  speaker: Speaker | null;
}> {
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
    variables: Record<string, string>;
  };

  const cast = await prisma.character.findMany({ where: { createdById: ownerId, id: { in: chatFields.character_ids } } });
  const ordered = chatFields.character_ids.flatMap((id) => cast.filter((character) => character.id === id));
  const promptCharacters = ordered.map((row) => ({
    id: row.id,
    ...(characters.fields(row) as Omit<PromptInput['characters'][number], 'id'>),
  }));
  // Narrating (A20), the GM speaks, so no character is named as the speaker.
  const speakerId = body.mode === 'narrate' ? '' : (body.speaker_id ?? promptCharacters[0]?.id);
  if (
    speakerId === undefined ||
    (body.mode !== 'narrate' && !promptCharacters.some((character) => character.id === speakerId))
  ) {
    throw validationError('The speaker must be a character in the chat', 'speaker_id');
  }

  const personaRow =
    chatFields.persona_id === null
      ? await prisma.persona.findFirst({ where: { createdById: ownerId, isDefault: true } })
      : await personas.find(chatFields.persona_id, ownerId);
  const persona = personaRow === null ? null : { name: personaRow.name, description: personaRow.description };

  const messages = (await chatMessages.list(ownerId, new URLSearchParams({ chat_id: chat.id }))).map((row) => ({
    id: row.id,
    created_at: row.createdAt,
    ...(chatMessages.fields(row) as {
      parent_id: string | null;
      role: PromptTurn['role'];
      channel: string;
      speaker_character_id: string | null;
      swipes: string[];
      swipe_index: number;
      images: string[];
      x_carded: boolean;
    }),
  }));
  if (body.leaf_id !== null && !messages.some((message) => message.id === body.leaf_id)) {
    throw validationError('The leaf must be a message in the chat', 'leaf_id');
  }
  const path = body.leaf_id === null ? [] : branchTo(messages, body.leaf_id);
  // The newest line's pictures go to a vision model (A44); older ones stay in the chat only.
  const leafMessage = path.at(-1);
  const images =
    leafMessage !== undefined && leafMessage.role === 'user' && leafMessage.channel === 'ic' ? leafMessage.images : [];
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
  const bookIds = [
    ...new Set([...chatFields.lorebook_ids, ...ordered.flatMap((row) => (row.lorebookId === null ? [] : [row.lorebookId]))]),
  ];
  const entryRows =
    bookIds.length === 0
      ? []
      : await prisma.lorebookEntry.findMany({ where: { createdById: ownerId, lorebookId: { in: bookIds } } });
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
  const sampler: Sampler =
    presetRow === null
      ? { ...PRESET_DEFAULTS, stop: [], prompt_layout: [] }
      : (presets.fields(presetRow) as unknown as Sampler);

  // The model for this request's role (A27): a model serving the role; for replies the chat's own
  // choice comes first. Otherwise the chat's model, then the default, then any.
  const role = roleOf(body.mode, purpose);
  // Search sources (A42) are endpoints too, but never a model.
  const all = (await endpoints.list(ownerId, NO_QUERY)).filter((row) => !isSearchApi(row.api));
  const serving = all.filter((row) => (endpoints.fields(row).roles as string[]).includes(role));
  const chosenRow = chatFields.endpoint_id === null ? null : await endpoints.find(chatFields.endpoint_id, ownerId);
  const chosen = chosenRow !== null && isSearchApi(chosenRow.api) ? null : chosenRow;
  // AP4: one of the person's own models, asked for this turn; another person's is not found.
  const asked = body.endpoint_id === null ? null : await endpoints.find(body.endpoint_id, ownerId);
  if (body.endpoint_id !== null && asked === null) throw notFound(endpoints.modelName);
  if (asked !== null && isSearchApi(asked.api)) throw validationError('A search source is not a model', 'endpoint_id');
  const endpointRow =
    asked ??
    (role === 'story' ? chosen : null) ??
    serving.find((row) => row.isDefault) ??
    serving[0] ??
    chosen ??
    all.find((row) => row.isDefault) ??
    all[0] ??
    null;
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
      macros: macroContext(chat.id, path, promptCharacters, speakerId, persona, endpointRow.model, chatFields.variables),
    },
    sampler,
    endpoint: {
      base_url: endpointRow.baseUrl,
      model: endpointRow.model,
      api_key: endpointRow.apiKey,
      api: endpointRow.api as EndpointApi,
      // The person's own template (A17) when it names one that is still theirs, else the built-in.
      instruct_template:
        (endpointRow.customTemplateId === null ? null : await ownTemplate(ownerId, endpointRow.customTemplateId)) ??
        (endpointRow.instructTemplate as InstructTemplateId),
    },
    loreState: lore.state,
    activeLore: lore.active,
    images,
    paused: chatFields.paused,
    lines: storyLines(
      path.map((message) => ({
        id: message.id,
        role: message.role,
        channel: message.channel,
        speaker_character_id: message.speaker_character_id,
        content: message.swipes[message.swipe_index] ?? '',
        x_carded: message.x_carded,
      })),
      persona?.name ?? DEFAULT_USER_NAME,
      new Map(promptCharacters.map((character) => [character.id, character.name])),
    ),
    speaker: ((row) =>
      row === undefined
        ? null
        : { id: row.id, name: row.name, extensions: characters.fields(row).extensions as Record<string, unknown> })(
      ordered.find((row) => row.id === speakerId),
    ),
  };
}

/**
 * The prompt with the chat's older lines recalled by meaning (A19), by the person's model set to
 * embed, and the speaker's other chats when it remembers across chats (AP8); unchanged for the
 * table GM, which reads only the recent table talk.
 */
async function withMemories(
  ownerId: string,
  body: z.infer<typeof request>,
  prompt: PromptInput,
  lines: readonly StoryLine[],
  speaker: Speaker | null,
  signal?: AbortSignal,
): Promise<PromptInput> {
  if (body.mode === 'table') return prompt;
  return { ...prompt, memories: await memoriesFor(ownerId, body.chat_id, lines, signal, speaker) };
}

/**
 * What SillyTavern's macros read in a reply's prompt (audit gap 1): the speaker's card and the
 * persona, the group, the branch's last lines, how long since the person's last line, this server's
 * clock (lite runs where the person is), a random source, and the chat's variables.
 */
function macroContext(
  chatId: string,
  path: readonly { id: string; created_at: Date; role: string; channel: string; swipes: string[]; swipe_index: number }[],
  cast: readonly PromptInput['characters'][number][],
  speakerId: string,
  persona: { name: string; description: string } | null,
  model: string,
  variables: Readonly<Record<string, string>>,
): NonNullable<PromptInput['macros']> {
  const speaker = cast.find((character) => character.id === speakerId);
  const userName = persona?.name ?? DEFAULT_USER_NAME;
  const story = new Set<string>(PROMPT.story_channels);
  const lines = path.filter((message) => story.has(message.channel));
  const lastOf = (role?: string) =>
    [...lines].reverse().find((message) => role === undefined || message.role === role);
  const textOf = (message: (typeof lines)[number] | undefined) => message?.swipes[message.swipe_index] ?? '';
  const lastUser = lastOf('user');
  const now = Date.now();
  return {
    group: cast.length > 1 ? cast.map((character) => character.name).join(', ') : '',
    not_char: [...cast.filter((character) => character.id !== speakerId).map((character) => character.name), userName].join(
      ', ',
    ),
    fields: {
      persona: persona?.description ?? '',
      description: speaker?.description ?? '',
      personality: speaker?.personality ?? '',
      scenario: speaker?.scenario ?? '',
      mesExamples: speaker?.example_messages ?? '',
      charPrompt: speaker?.system_prompt ?? '',
      charInstruction: speaker?.post_history_instructions ?? '',
      model,
    },
    chat: {
      chat_id: chatId,
      last_message: textOf(lastOf()),
      last_user_message: textOf(lastUser),
      last_char_message: textOf(lastOf('character')),
      last_message_id: path.at(-1)?.id ?? '',
      ...(lastUser === undefined ? {} : { idle_seconds: Math.max(0, (now - lastUser.created_at.getTime()) / 1000) }),
    },
    now: { epoch_ms: now, utc_offset_minutes: -new Date(now).getTimezoneOffset() },
    random: Math.random,
    local: variables,
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
      OR: [
        { scope: 'global' },
        { scope: 'chat', scopeId: chatId },
        { scope: 'character', scopeId: { in: [...characterIds] } },
      ],
    },
    orderBy: { name: 'asc' },
  });
  // In the server's order: everyone's, then the chat's, then each cast member's in turn.
  const rank = (row: (typeof rows)[number]) =>
    row.scope === 'global' ? -2 : row.scope === 'chat' ? -1 : characterIds.indexOf(row.scopeId ?? '');
  return rows.sort((a, b) => rank(a) - rank(b)).map((row) => row.text);
}

/**
 * The chat's variables after a reply's macros set them (audit gap 1); written only when they changed,
 * and without touching the chat's version, so an open editor's next save isn't refused as stale.
 */
export async function saveVariables(
  ownerId: string,
  chatId: string,
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>> | undefined,
): Promise<void> {
  if (after === undefined || JSON.stringify(after) === JSON.stringify(before)) return;
  await prisma.chat.updateMany({ where: { id: chatId, createdById: ownerId }, data: { variables: JSON.stringify(after) } });
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
  // Whichever completions path it was given, the one this API takes (a text API's "/completions"
  // is also the tail of "/chat/completions", so the path is replaced, never just kept).
  const path = api === 'chat' ? '/chat/completions' : '/completions';
  return `${baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '')}${path}`;
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
      ? {
          role: message.role,
          content: [
            { type: 'text', text: message.content },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        }
      : message,
  );
}

/**
 * What the model endpoint is sent: the messages for a chat API, or for a text API one prompt in
 * the endpoint's instruct template (a continued reply left open), with its stop strings added.
 */
export function upstreamBody(
  endpoint: Endpoint,
  sampler: Sampler,
  messages: readonly ModelMessage[],
  mode: PromptMode,
  images: readonly string[] = [],
): Record<string, unknown> {
  // AI Horde (A48) takes one prompt, as a text API does.
  const text = endpoint.api === 'text' || endpoint.api === 'horde';
  const stop = [...sampler.stop, ...(text ? instructStops(endpoint.instruct_template) : [])];
  return {
    model: endpoint.model,
    ...(text
      ? { prompt: renderInstruct(messages, endpoint.instruct_template, mode === 'continue') }
      : { messages: withImages(messages, images) }),
    stream: true,
    temperature: sampler.temperature,
    top_p: sampler.top_p,
    top_k: sampler.top_k,
    repetition_penalty: sampler.repetition_penalty,
    max_tokens: sampler.max_tokens,
    ...(stop.length === 0 ? {} : { stop }),
    // Sent only when set (A47): servers that do not take them never see them.
    ...(Object.keys(sampler.logit_bias ?? {}).length === 0 ? {} : { logit_bias: sampler.logit_bias }),
    ...((sampler.negative_prompt ?? '').trim() === '' ? {} : { negative_prompt: sampler.negative_prompt }),
    ...(sampler.guidance_scale == null ? {} : { guidance_scale: sampler.guidance_scale }),
    // SillyTavern's further samplers (audit gap 2): only the ones set, only to APIs that take them.
    ...samplerParams(sampler.samplers ?? {}, endpoint.api),
  };
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  Connection: 'keep-alive',
};

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
 * entries that would go in. A preview: the lore timers do not move and no chat model is asked (a
 * model set to embed may be, to recall the chat's older lines, A19).
 */
export async function inspectPrompt(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, activeLore, lines, speaker } = await generationInputs(owner.id, body);
    const assembled = promptFor(body.mode, await withMemories(owner.id, body, prompt, lines, speaker, nextRequest.signal));
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
/** AI Horde's text job (A48), from the body a text API would get. */
export function hordeBody(body: Record<string, unknown>): Record<string, unknown> {
  const stop = body.stop;
  return {
    prompt: body.prompt,
    params: {
      max_length: body.max_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      top_k: body.top_k,
      rep_pen: body.repetition_penalty,
      ...(Array.isArray(stop) && stop.length > 0 ? { stop_sequence: stop } : {}),
    },
    models: typeof body.model === 'string' && body.model !== '' ? [body.model] : [],
  };
}

/** One text completion's stream, as an OpenAI-compatible server sends it: what the rest reads. */
export function textAsStream(text: string): ReadableStream<Uint8Array> {
  const body = `data: ${JSON.stringify({ choices: [{ text }] })}\n\ndata: [DONE]\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError(499, { message: 'The request was stopped', code: 'stopped' }));
    });
  });

/** AI Horde (A48): the job submitted, then polled until it is done; its text as a stream. */
async function askHorde(
  endpoint: Endpoint,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const base = endpoint.base_url.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    apikey: endpoint.api_key === '' ? HORDE.anonymous_key : endpoint.api_key,
    'Client-Agent': HORDE.client_agent,
  };
  const unreachable = () => {
    throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
  };
  const submitted = await fetch(`${base}${HORDE.submit_path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(hordeBody(body)),
    signal,
  }).catch(unreachable);
  if (!submitted.ok)
    throw new ApiError(502, { message: `The model endpoint answered ${submitted.status}`, code: 'model_refused' });
  const id: unknown = Reflect.get(Object(await submitted.json().catch(() => null)), 'id');
  if (typeof id !== 'string') throw new ApiError(502, { message: 'The Horde gave no job', code: 'model_refused' });
  const deadline = Date.now() + HORDE.wait_ms;
  const poll = async (): Promise<string> => {
    if (Date.now() > deadline) throw new ApiError(504, { message: 'The Horde took too long', code: 'model_timeout' });
    await wait(HORDE.poll_ms, signal);
    const answer = await fetch(`${base}${HORDE.status_path}${id}`, { headers, signal }).catch(unreachable);
    const status: unknown = await answer.json().catch(() => null);
    if (Reflect.get(Object(status), 'faulted') === true)
      throw new ApiError(502, { message: 'The Horde could not write it', code: 'model_refused' });
    if (Reflect.get(Object(status), 'done') !== true) return poll();
    const generations: unknown = Reflect.get(Object(status), 'generations');
    const text: unknown = Reflect.get(Object(Array.isArray(generations) ? generations[0] : undefined), 'text');
    return typeof text === 'string' ? text : '';
  };
  return textAsStream(await poll());
}

async function askModel(
  endpoint: Endpoint,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  if (endpoint.api === 'horde') return askHorde(endpoint, body, signal);
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
    const { prompt, sampler, endpoint } = await generationInputs(owner.id, body, Math.random, 'summary');
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
    if (!parsed.success)
      throw validationError('A translate object with a chat_id, text and language is required', 'translate');
    const asked = parsed.data;
    const { sampler, endpoint } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: null, speaker_id: null, mode: 'reply', endpoint_id: null },
      Math.random,
      'translate',
    );
    const stream = await askModel(
      endpoint,
      upstreamBody(endpoint, sampler, translatePrompt(asked.text, asked.language), 'reply'),
      nextRequest.signal,
    );
    const text = await collect(completionDeltas(stream)).catch(() => {
      throw new ApiError(502, { message: 'The model stopped mid-translation', code: 'model_refused' });
    });
    return Response.json({ translate: { ...asked, text: text.trim() } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** The address a server lists its models at (OpenAI-compatible `GET /models`). */
export function modelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '')}/models`;
}

const PING_TIMEOUT_MS = 8000;

/**
 * `POST /v1/ai_chat/ping` (A28): whether a model's server answers, how quickly, and whether it
 * offers the model asked for. Request `{ "ping": { "endpoint_id" } }`; answer `{ "ping": { "ok",
 * "latency_ms", "status", "has_model", "detail" } }` (a server that cannot be reached is `ok:
 * false`, never an error: this is a check).
 */
export async function ping(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = z.object({ endpoint_id: z.string().min(1) }).safeParse(Reflect.get(envelope, 'ping'));
    if (!parsed.success) throw validationError('A ping object with an endpoint_id is required', 'ping');
    const row = await endpoints.find(parsed.data.endpoint_id, owner.id);
    if (row === null) throw notFound(endpoints.modelName);
    const started = Date.now();
    const answer = await fetch(modelsUrl(row.baseUrl), {
      headers: row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` },
      signal: AbortSignal.any([nextRequest.signal, AbortSignal.timeout(PING_TIMEOUT_MS)]),
    }).catch(() => null);
    const latency = Date.now() - started;
    if (answer === null)
      return Response.json({
        ping: { ok: false, latency_ms: latency, status: null, has_model: null, detail: 'The server could not be reached' },
      });
    const body: unknown = await answer.json().catch(() => null);
    const listed: unknown = Reflect.get(Object(body), 'data');
    const ids = Array.isArray(listed)
      ? listed.flatMap((model) =>
          typeof Reflect.get(Object(model), 'id') === 'string' ? [String(Reflect.get(Object(model), 'id'))] : [],
        )
      : null;
    return Response.json({
      ping: {
        ok: answer.ok,
        latency_ms: latency,
        status: answer.status,
        has_model: ids === null ? null : ids.includes(row.model),
        detail: answer.ok
          ? ids === null
            ? 'Answered, without a model list'
            : `${ids.length} models offered`
          : `Answered ${answer.status}`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const expressionRequest = z.object({
  chat_id: z.string().min(1),
  character_id: z.string().min(1),
  text: z.string().min(1).max(LIMITS.message_characters),
});

/**
 * `POST /v1/ai_chat/expression` (A4): which of a character's sprites fits a line. The chat's model
 * (the one serving summaries, when there is one) chooses from the character's own labels, as a
 * decision model does: it never names one that is not there. `{ "expression": { "label" } }`, the
 * label null when the character has no sprites or the model named none.
 */
export async function expression(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = expressionRequest.safeParse(Reflect.get(envelope, 'expression'));
    if (!parsed.success)
      throw validationError('An expression object with a chat_id, character_id and text is required', 'expression');
    const asked = parsed.data;
    const labels = (
      await prisma.characterExpression.findMany({
        where: { createdById: owner.id, characterId: asked.character_id },
        orderBy: { label: 'asc' },
      })
    ).map((row) => row.label);
    if (labels.length === 0) return Response.json({ expression: { label: null } });
    // A decision model, when the person has one (the decide role), answers this as a choice among
    // the labels; without one, or when it gives no answer, the chat's own model is asked as before.
    const deciding = await decider(owner.id);
    if (deciding !== null) {
      const answers = await askDecider(
        deciding,
        splitReasoning(asked.text).reply,
        { expression: { type: 'choice', instructions: 'Which feeling fits how this line is said?', criteria: labels } },
        nextRequest.signal,
      );
      const decided = answers?.expression;
      if (decided != null && 'choice' in decided) return Response.json({ expression: { label: decided.choice } });
    }
    const { sampler, endpoint } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: null, speaker_id: null, mode: 'reply', endpoint_id: null },
      Math.random,
      'summary',
    );
    const stream = await askModel(
      endpoint,
      upstreamBody(
        endpoint,
        { ...sampler, max_tokens: 8 },
        expressionPrompt(splitReasoning(asked.text).reply, labels),
        'reply',
      ),
      nextRequest.signal,
    );
    const answer = await collect(completionDeltas(stream)).catch(() => '');
    return Response.json({ expression: { label: pickOption(answer, labels) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** The address a server draws pictures at (OpenAI-compatible `POST /images/generations`). */
export function imagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/(chat\/)?completions$/, '')}/images/generations`;
}

/**
 * The picture in an image model's answer, as a data URL: its `b64_json`, or a `url` that is already
 * a data URL. A link elsewhere is not fetched (the server never follows a model's links).
 */
export function pictureOf(answer: unknown): string | null {
  const data: unknown = Reflect.get(Object(answer), 'data');
  const first: unknown = Array.isArray(data) ? data[0] : undefined;
  const b64: unknown = Reflect.get(Object(first), 'b64_json');
  if (typeof b64 === 'string' && b64 !== '') return `data:image/png;base64,${b64}`;
  const url: unknown = Reflect.get(Object(first), 'url');
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null;
}

const pictureRequest = z
  .object({
    kind: z.enum(PICTURE.kinds as [string, ...string[]]).default('scene'),
    chat_id: z.string().min(1).nullable().default(null),
    character_id: z.string().min(1).nullable().default(null),
    leaf_id: z.string().nullable().default(null),
    prompt: z.string().max(PICTURE.prompt_characters).default(''),
  })
  .refine((asked) => (asked.kind === 'portrait' ? asked.character_id !== null : asked.chat_id !== null), {
    message: 'A portrait names a character_id; a scene or background a chat_id',
  });

/**
 * `POST /v1/ai_chat/picture` (A30): a picture drawn by a model the person set to draw (the `image`
 * role; a chat model is never asked). Request `{ "picture": { "kind", "chat_id", "character_id",
 * "leaf_id", "prompt" } }`, `kind` one of:
 * - `scene` (the default): the last story turns of `chat_id`, or the prompt;
 * - `portrait`: the character `character_id`, from its name and description, or the prompt;
 * - `background`: the place `chat_id` is set in (its first character's scenario, else the last
 *   story turns), or the prompt.
 * Answer `{ "picture": { "prompt", "image" } }`, the image a data URL; the caller keeps it (a
 * chat line, an avatar, a background) with the record's own update.
 */
/** What the picture route asks the image model to draw, for each kind. */
async function picturePrompt(ownerId: string, asked: z.infer<typeof pictureRequest>): Promise<string> {
  if (asked.kind === 'portrait') {
    const row = await characters.find(asked.character_id ?? '', ownerId);
    if (row === null) throw notFound(characters.modelName);
    const fields = characters.fields(row) as { name: string; description: string };
    return portraitPicturePrompt(fields, asked.prompt);
  }
  const { prompt: input } = await generationInputs(ownerId, {
    chat_id: asked.chat_id ?? '',
    leaf_id: asked.leaf_id,
    speaker_id: null,
    mode: 'reply',
    endpoint_id: null,
  });
  return asked.kind === 'background'
    ? backgroundPicturePrompt(input, input.characters[0]?.scenario ?? '', asked.prompt)
    : scenePicturePrompt(input, asked.prompt);
}

export async function picture(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = pictureRequest.safeParse(Reflect.get(envelope, 'picture'));
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'A picture object is required', 'picture');
    const asked = parsed.data;
    const drawing = (await endpoints.list(owner.id, NO_QUERY))
      .filter((row) => (endpoints.fields(row).roles as string[]).includes('image'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const row = drawing.find((one) => one.isDefault) ?? drawing[0];
    if (row === undefined)
      throw new ApiError(409, { message: 'Set a model to draw pictures first', code: 'no_image_model' });
    const prompt = await picturePrompt(owner.id, asked);
    const answer = await fetch(imagesUrl(row.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
      },
      body: JSON.stringify({
        model: row.model,
        prompt,
        n: 1,
        size: row.imageSize === '' ? PICTURE.size : row.imageSize,
        response_format: 'b64_json',
      }),
      signal: nextRequest.signal,
    }).catch(() => {
      throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
    });
    if (answer.status >= 400)
      throw new ApiError(502, { message: `The model endpoint answered ${answer.status}`, code: 'model_refused' });
    const image = pictureOf(await answer.json().catch(() => null));
    if (image === null || image.length > LIMITS.avatar_bytes)
      throw new ApiError(502, { message: 'The model sent no picture this app can keep', code: 'model_refused' });
    return Response.json({ picture: { prompt, image } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function generate(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const body = await readRequest(nextRequest);
    const { prompt, sampler, endpoint, loreState, images, paused, lines, speaker } = await generationInputs(owner.id, body);
    // Paused (A25): no story turns until the table resumes. The table GM still answers.
    if (paused && body.mode !== 'table')
      throw new ApiError(409, { message: 'The table has paused the game', code: 'paused' });
    const assembled = promptFor(body.mode, await withMemories(owner.id, body, prompt, lines, speaker, nextRequest.signal));
    // The lore timers move with the reply that read them, and so do the variables its macros set.
    await saveLoreState(owner.id, body.chat_id, loreState);
    await saveVariables(owner.id, body.chat_id, prompt.macros?.local ?? {}, assembled.variables?.local);

    const upstream = await askModel(
      endpoint,
      upstreamBody(endpoint, sampler, assembled.messages, body.mode === 'table' ? 'reply' : body.mode, images),
      nextRequest.signal,
    );
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
