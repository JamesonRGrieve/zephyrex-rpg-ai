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
  NARRATOR_STYLE,
  PICTURE,
  PRESET_DEFAULTS,
  PROMPT,
  SAMPLER_RANGES,
  TABLE,
} from '~/contract';
import { branchTo } from '~/features/chat/branch';
import { aiCast, sessionStartIndex, sessionsSummary } from '~/features/chat/play';
import { groupStops } from '~/features/chat/group';
import { genMessages } from '~/features/prompt/gen';
import { clarifyNeed, clarifyQuestions, shouldAsk } from '~/features/chat/clarify';
import { mapQuestions, movers, seatPlace } from '~/features/world/mapStep';
import { statusMessages } from '~/features/chat/statusLine';
import { type Dispositions, applyStances, parseStatus, sceneState } from '~/features/chat/dispositions';
import { paragraphCut } from '~/features/chat/voiceGuard';
import { frameFromFraming } from '~/features/prompt/campaignFraming';
import { frameFor } from '~/lib/frameCopy';
import { parsePlayerLines, stripMarkup } from '~/features/chat/playerLines';
import { isAttempt, rollPick, rollQuestions } from '~/features/chat/rollDecision';
import { oneLine, partyBriefing, partyOf, partyText } from '~/features/prompt/party';
import { systemsBeforeLastUser } from '~/features/prompt/systemOrder';
import {
  type Move,
  type RoutineSlot,
  type TickPerson,
  arrivals,
  tickMoves,
  tickQuestions,
  tickState,
} from '~/features/world/worldTick';
import {
  type NarratorStyle,
  type StyleEndpoint,
  type Traits,
  mayNarrate,
  narratorEndpoint,
  styleTuning,
  traitsOf,
} from '~/features/models/narratorStyle';
import { presentCast, turnPick, turnQuestion, turnSeat, turnState } from '~/features/chat/turnDecision';
import { wikiCampaignOf, worldLoreEntries } from '~/features/lore/worldLore';
import { type CastEntity, seatPerson, worldCast, worldKnownTo } from '~/features/prompt/worldCast';
import { sceneLocation } from '~/features/campaign/sceneLocation';
import { NO_WORLD, type WorldReader, wikiReader } from '~/lib/wikiWorld';
import { type ExtraBody, storedExtraBody, withExtraBody } from '~/features/models/extraBody';
import type { GroupSettings } from '~/features/chat/groupSettings';
import type { Injection } from '~/features/chat/injections';
import { activateLore, type LoreSettings, type LoreState } from '~/features/lore/activate';
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
  type LayoutEntry,
  type PromptTurn,
} from '~/features/prompt/assemble';
import { type InstructTemplate, instructStops, renderInstruct } from '~/features/prompt/instruct';
import { activatedTemplate, ownTemplate } from '~/lib/instructTemplateRecords';
import type { RegexScript } from '~/features/chat/regex';
import { regexScripts } from '~/lib/regexRecords';
import { dataBankText, wikiDocumentTexts } from '~/features/chat/dataBank';
import { type StoryLine, storyLines } from '~/features/memory/memory';
import { memoriesFor, type Speaker } from '~/lib/memory';
import { samplerParams, type SamplerValues } from '~/features/prompt/samplers';
import {
  isNativeApi,
  type NativeApi,
  nativeModelIds,
  nativeModelsRequest,
  nativeRequest,
  openAiPayload,
} from '~/features/models/nativeApis';
import { campaigns, scenarios } from '~/lib/campaignRecords';
import { completionDeltas } from '~/lib/completionStream';
import { askDecider, decider } from '~/lib/decider';
import { prisma } from '~/lib/prisma';
import { chatMessages, chats, characters, endpoints, presets } from '~/lib/rpgRecords';

const request = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  speaker_id: z.string().min(1).nullable().default(null),
  mode: z.enum(['reply', 'continue', 'impersonate', 'table', 'narrate']).default('reply'),
  /** AP4: this turn asked of another of the person's models, to compare (kept as another swipe). */
  endpoint_id: z.string().min(1).nullable().default(null),
  /** A regeneration after the voice guard (features/chat/voiceGuard.ts) caught a span: it's forbidden. */
  forbid: z
    .object({
      names: z.array(z.string().max(LIMITS.model_name_characters)).max(LIMITS.characters_per_chat),
      span: z.string().max(4000),
      // Replays (voiceGuard.ts replayOf): every span retold, forbidden in one regeneration.
      spans: z.array(z.string().max(4000)).max(20).optional(),
    })
    .nullable()
    .default(null),
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
  prompt_layout: LayoutEntry[];
  logit_bias?: Record<string, number>;
  negative_prompt?: string;
  guidance_scale?: number | null;
  /** SillyTavern's further samplers (audit gap 2): only the ones set. */
  samplers?: SamplerValues;
  /** A story turn: no max_tokens on the wire (max_tokens still reserves room in the context budget). */
  uncapped?: boolean;
}

export interface Endpoint {
  base_url: string;
  model: string;
  api_key: string;
  api: EndpointApi;
  instruct_template: InstructTemplateId | InstructTemplate;
  /** Extra request fields, merged into each request it's sent (SillyTavern's additional parameters). */
  extra_body?: ExtraBody;
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
  world: WorldReader = NO_WORLD,
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
  /** The wiki's world as this voice may know it (worldKnownTo), for decided turns' presence. */
  world: CastEntity[];
  /**
   * Where a background is set: the wiki location the story names last (sceneLocation over the
   * campaign's locations), else the chat's own scenario; empty when neither says.
   */
  place: string;
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
    group_settings: GroupSettings;
    narrator_style?: NarratorStyle;
    dispositions?: Dispositions;
    injections: Injection[];
  };

  // The composed suite (docs/DESIGN.md): the chat's wiki campaign's world entities are read once,
  // through the wiki's API, for World Info, the cast and the seat. A chat's characters are wiki
  // persons; one the campaign doesn't hold (a sandbox's, from elsewhere) is read by id, and one that
  // can't be read drops out.
  const frameRow =
    chatFields.campaign_id === null
      ? null
      : await prisma.campaignFrame.findFirst({
          // A wiki campaign's frame is the one naming it (a frame's id is never chosen).
          where: { OR: [{ id: chatFields.campaign_id }, { wikiCampaignId: chatFields.campaign_id }], createdById: ownerId },
        });
  const wikiCampaign = wikiCampaignOf(
    chatFields.campaign_id,
    new Map(frameRow === null ? [] : [[frameRow.id, frameRow.wikiCampaignId]]),
  );
  const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
  const playingId = play?.playingId ?? null;
  const campaignEntities = wikiCampaign === null ? [] : await world.campaign(wikiCampaign);
  const heldPersons = new Set(
    campaignEntities.filter((entity) => entity.kind === 'person' && entity.deleted !== true).map((entity) => entity.id),
  );
  const wanted = [...chatFields.character_ids, ...(playingId === null ? [] : [playingId])];
  const elsewhere = await world.byIds([...new Set(wanted.filter((id) => !heldPersons.has(id)))]);
  const allEntities = [...campaignEntities, ...elsewhere];
  const castIds = worldCast(allEntities, chatFields.character_ids).map((character) => character.id);
  // Narrating (A20), the GM speaks, so no character is named as the speaker.
  // Translating reads no cast, so it needs no speaker.
  const noSpeaker = body.mode === 'narrate' || (purpose === 'translate' && castIds.length === 0);
  const speakerId = noSpeaker ? '' : (body.speaker_id ?? castIds[0]);
  // GM secrets (E): a GM-only record reaches the GM's prompts and that person's own voice only.
  const entities = worldKnownTo(allEntities, speakerId ?? null, body.mode === 'narrate' || body.mode === 'table');
  const promptCharacters = worldCast(entities, chatFields.character_ids);
  if (speakerId === undefined || (!noSpeaker && !promptCharacters.some((character) => character.id === speakerId))) {
    throw validationError('The speaker must be a character in the chat', 'speaker_id');
  }

  // A campaign (docs/DESIGN.md, The play model): the character the person plays is who they are,
  // and leaves the cast the AI plays; replies read the current session, earlier ones by summary.
  const aiIds = new Set(aiCast(chatFields.character_ids, playingId));
  const aiCharacters = promptCharacters.filter((character) => aiIds.has(character.id));

  // Who the person speaks as: the wiki person the seat holds (the composed suite); no persona store.
  const persona = seatPerson(entities, playingId);

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
      hidden: boolean;
    }),
  }));
  if (body.leaf_id !== null && !messages.some((message) => message.id === body.leaf_id)) {
    throw validationError('The leaf must be a message in the chat', 'leaf_id');
  }
  const fullPath = body.leaf_id === null ? [] : branchTo(messages, body.leaf_id);
  const sessionRows = await prisma.chatSession.findMany({ where: { chatId: chat.id, createdById: ownerId } });
  const sessionMarks = sessionRows.map((row) => ({
    number: row.number,
    start_message_id: row.startMessageId,
    summary: row.summary,
  }));
  // The current session's lines only: earlier sessions reach the model as their summaries.
  const path = fullPath.slice(sessionStartIndex(fullPath, sessionMarks));
  const sessionSummary = sessionsSummary(fullPath, sessionMarks);
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
    hidden: message.hidden,
  }));

  // World Info: the chat's lorebooks and each cast member's own, scanned against the branch's story.
  const story = new Set<string>(PROMPT.story_channels);
  // What lore and the data bank scan: the story, less what the table X-carded (A25).
  const storyTexts = history
    .filter((turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true)
    .map((turn) => turn.content);
  // World Info runs over the wiki (the composed suite): the chat's wiki campaign's entities and its
  // setting's canon, read through the wiki's API; no wiki campaign, no world lore.
  const entries = worldLoreEntries(entities);
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
  const usualRow =
    asked ??
    (role === 'story' ? chosen : null) ??
    serving.find((row) => row.isDefault) ??
    serving[0] ??
    chosen ??
    all.find((row) => row.isDefault) ??
    all[0] ??
    null;
  if (usualRow === null) throw new ApiError(409, { message: 'Add a model endpoint first', code: 'no_model_endpoint' });
  // Narrator sliders (features/models/narratorStyle.ts, the operator 2026-11-21): a story or GM turn
  // with no model of its own named takes the endpoint nearest the chat's sliders, and never one that
  // may not narrate (under 10b, not a narrator, or not adherent enough).
  const style: NarratorStyle = chatFields.narrator_style ?? {};
  const styleRows: StyleEndpoint[] = all.map((row) => {
    const fields = endpoints.fields(row) as { roles: string[]; traits?: Traits };
    return { id: row.id, model: row.model, roles: fields.roles, is_default: row.isDefault, traits: fields.traits ?? {} };
  });
  const sliders = NARRATOR_STYLE.sliders.some((slider) => typeof style[slider] === 'number');
  const usual = styleRows.find((one) => one.id === usualRow.id);
  const styled =
    purpose === 'reply' &&
    (role === 'story' || role === 'gm') &&
    asked === null &&
    !(role === 'story' && chosen !== null) &&
    (sliders || (usual !== undefined && !mayNarrate(traitsOf(usual))))
      ? narratorEndpoint(styleRows, style, null)
      : null;
  const endpointRow = all.find((row) => row.id === styled) ?? usualRow;
  const tuning = styleTuning(style, chatFields.content_rating);

  // The person's own template (A17) when the endpoint names one that is still theirs; else the one
  // whose activation regex its model matches (audit gap 4); else the built-in.
  const instructTemplate: InstructTemplateId | InstructTemplate =
    (endpointRow.customTemplateId === null ? null : await ownTemplate(ownerId, endpointRow.customTemplateId)) ??
    (await activatedTemplate(ownerId, endpointRow.model)) ??
    (endpointRow.instructTemplate as InstructTemplateId);
  // Group stop strings (features/chat/group.ts): a reply ends where it starts another speaker's line.
  const guarded: Sampler =
    purpose === 'reply'
      ? {
          ...sampler,
          // No token ceiling on a story turn (the operator, 2026-11-21: "Quit it with the response token
          // limits, it cuts shit off more than it helps"): length is the prompt's and the verbosity
          // slider's wording; completeText guards a stream that truly ends mid-sentence.
          uncapped: true,
          // The narrator sliders' humour warms the temperature.
          temperature: sampler.temperature + tuning.temperature_delta,
          // Against replays (the play-test: a round retold almost word for word): the preset's own win.
          samplers: { ...PROMPT.story_penalties, ...(sampler.samplers ?? {}) },
          stop: [
            ...new Set([
              ...sampler.stop,
              ...groupStops(
                body.mode,
                // Writing the person's own line, no character is speaking.
                body.mode === 'impersonate' ? '' : speakerName,
                aiCharacters.map((character) => character.name),
                persona?.name ?? DEFAULT_USER_NAME,
                // The most recent speakers first, for the four stops there are.
                [...history]
                  .reverse()
                  .flatMap((turn) =>
                    turn.role === 'character'
                      ? aiCharacters.filter((one) => one.id === turn.speaker_character_id).map((one) => one.name)
                      : [],
                  ),
              ),
            ]),
          ],
        }
      : sampler;
  return {
    prompt: {
      characters: aiCharacters,
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
      summary: [chatFields.summary.trim(), sessionSummary].filter((part) => part !== '').join('\n\n'),
      objective: chatFields.objectives.find((one) => !one.done)?.text ?? '',
      safety: { content_rating: chatFields.content_rating, lines: chatFields.lines, veils: chatFields.veils },
      table_notes: chatFields.table_notes,
      frame: chatFields.campaign_id === null ? null : await campaignFrame(ownerId, chatFields.campaign_id, world),
      // A group's joined cards and own scenario (audit gap 6).
      group: chatFields.group_settings,
      // The chat's /inject injections (audit gap 5).
      injections: chatFields.injections,
      forbid: body.forbid,
      // Grounded state (features/chat/dispositions.ts): who is here and the stances this voice reads.
      scene: sceneState(
        [
          ...(persona === null || playingId === null
            ? []
            : [{ id: playingId, name: persona.name, line: oneLine(persona.description) }]),
          ...aiCharacters.map((character) => ({
            id: character.id,
            name: character.name,
            line: oneLine(character.description),
          })),
        ],
        chatFields.dispositions ?? {},
        body.mode === 'narrate' ? null : speakerId,
      ),
      // The sliders' lines: the narrator reads the length and the tone; a voice, the length.
      style: [tuning.length, ...(body.mode === 'narrate' ? tuning.tones : [])].filter((line) => line !== '').join(' '),
      // Party members know each other (the operator, 2026-11-21): roster, relationships, briefing.
      party: partyText(
        partyOf(entities, chatFields.character_ids, playingId),
        body.mode === 'narrate' ? null : speakerId,
        entities,
        partyBriefing(entities),
      ),
      scenario: chatFields.scenario_id === null ? null : await runningScenario(ownerId, chatFields.scenario_id),
      // The data bank from the wiki (mapping item 4): the campaign's documents.
      data_bank: dataBankText(
        wikiDocumentTexts(
          wikiCampaign === null ? [] : await world.documents(wikiCampaign),
          body.mode === 'narrate' || body.mode === 'table',
        ),
        storyTexts,
      ),
      regex: (await regexScripts.list(ownerId, NO_QUERY)).map((row) => regexScripts.fields(row) as unknown as RegexScript),
      // A text API's own template may carry SillyTavern's context template (audit gap 4).
      ...(typeof instructTemplate === 'string' || (endpointRow.api !== 'text' && endpointRow.api !== 'horde')
        ? {}
        : {
            template: {
              story_string: instructTemplate.story_string ?? '',
              example_separator: instructTemplate.example_separator ?? '',
              chat_start: instructTemplate.chat_start ?? '',
              include_names: instructTemplate.include_names === true,
            },
          }),
      macros: macroContext(chat.id, path, promptCharacters, speakerId, persona, endpointRow.model, chatFields.variables),
    },
    sampler: guarded,
    endpoint: {
      base_url: endpointRow.baseUrl,
      model: endpointRow.model,
      api_key: endpointRow.apiKey,
      api: endpointRow.api as EndpointApi,
      // The person's own template (A17) when it names one that is still theirs, else the built-in.
      instruct_template: instructTemplate,
      extra_body: storedExtraBody(endpointRow.extraBody),
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
        hidden: message.hidden,
      })),
      persona?.name ?? DEFAULT_USER_NAME,
      new Map(promptCharacters.map((character) => [character.id, character.name])),
    ),
    place: backgroundPlace(entities, history, chatFields.group_settings.scenario ?? ''),
    world: entities,
    speaker: ((row) => (row === undefined ? null : { id: row.id, name: row.name, extensions: row.extensions ?? {} }))(
      promptCharacters.find((character) => character.id === speakerId),
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
  const lastOf = (role?: string) => [...lines].reverse().find((message) => role === undefined || message.role === role);
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

/**
 * A chat's campaign frame (A57), as frameText reads it: the frame row (by id, or the wiki campaign it
 * names), else the wiki campaign's own framing (a vault scenario has no row; Zephyrex RPG,
 * 2026-11-22); none without either.
 */
async function campaignFrame(ownerId: string, campaignId: string, world: WorldReader): Promise<CampaignFrame | null> {
  const row = await frameFor(ownerId, campaignId);
  if (row !== null) return campaigns.fields(row) as unknown as CampaignFrame;
  return frameFromFraming(await world.framing(campaignId)) as CampaignFrame | null;
}

/** A background's place: the wiki location the story names last, else the chat's own scenario. */
function backgroundPlace(entities: readonly CastEntity[], history: readonly PromptTurn[], scenario: string): string {
  const story = new Set<string>(PROMPT.story_channels);
  const locations = entities
    .filter((entity) => entity.kind === 'location' && entity.deleted !== true)
    .map((entity) => ({ ...entity, aliases: [...((entity as { aliases?: string[] }).aliases ?? [])] }));
  const at = sceneLocation(
    history.map((turn) => ({ text: turn.content, channel: story.has(turn.channel) ? 'story' : turn.channel })),
    locations,
  );
  const location = locations.find((entity) => entity.id === at);
  return (location?.summary ?? '').trim() || scenario.trim();
}

/** The scenario a chat runs (A59, A60), as scenarioText reads it; none when it is gone. */
async function runningScenario(ownerId: string, scenarioId: string): Promise<ScenarioView | null> {
  const row = await scenarios.find(scenarioId, ownerId);
  return row === null ? null : (scenarios.fields(row) as unknown as ScenarioView);
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
      : // The person's last line goes last (systemOrder.ts): some templates drop a trailing system message.
        { messages: withImages(systemsBeforeLastUser(messages), isNativeApi(endpoint.api) ? [] : images) }),
    stream: true,
    temperature: sampler.temperature,
    top_p: sampler.top_p,
    top_k: sampler.top_k,
    repetition_penalty: sampler.repetition_penalty,
    // A story turn sends none (uncapped); an API that requires one gets its top (nativeApis, hordeBody).
    ...(sampler.uncapped === true ? {} : { max_tokens: sampler.max_tokens }),
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
    const { prompt, sampler, activeLore, lines, speaker } = await generationInputs(
      owner.id,
      body,
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
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
      // Horde requires a length: a story turn's (uncapped) is the top of the range.
      max_length: body.max_tokens ?? SAMPLER_RANGES.max_tokens[1],
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
  // Anthropic's and Google's own APIs (audit gap 8): asked in their shape, read back as OpenAI's.
  const native = isNativeApi(endpoint.api) ? nativeRequest(endpoint.api, endpoint.base_url, endpoint.api_key, body) : null;
  const upstream = await fetch(native?.url ?? completionsUrl(endpoint.base_url, endpoint.api), {
    method: 'POST',
    headers: native?.headers ?? {
      'Content-Type': 'application/json',
      ...(endpoint.api_key === '' ? {} : { Authorization: `Bearer ${endpoint.api_key}` }),
    },
    // The endpoint's extra request fields go last, over everything but the conversation's own.
    body: JSON.stringify(withExtraBody(native?.json ?? body, endpoint.extra_body)),
    signal,
  }).catch(() => {
    throw new ApiError(502, { message: 'The model endpoint could not be reached', code: 'model_unreachable' });
  });
  if (!upstream.ok || upstream.body === null) {
    throw new ApiError(502, { message: `The model endpoint answered ${upstream.status}`, code: 'model_refused' });
  }
  return isNativeApi(endpoint.api) ? asOpenAiStream(upstream.body, endpoint.api) : upstream.body;
}

/** A native API's server-sent events as OpenAI chunk events (audit gap 8), for the one stream reader. */
function asOpenAiStream(body: ReadableStream<Uint8Array>, api: NativeApi): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carried = '';
  const rewrite = (lines: string[]) =>
    lines.flatMap((line) => {
      if (!line.startsWith('data:')) return [];
      const chunk = openAiPayload(api, line.slice('data:'.length));
      return chunk === null ? [] : [`data: ${chunk}\n\n`];
    });
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(piece, controller) {
        const lines = (carried + decoder.decode(piece, { stream: true })).split(/\r?\n/);
        carried = lines.pop() ?? '';
        for (const out of rewrite(lines)) controller.enqueue(encoder.encode(out));
      },
      flush(controller) {
        for (const out of rewrite([carried + decoder.decode()])) controller.enqueue(encoder.encode(out));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      },
    }),
  );
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
    const { prompt, sampler, endpoint } = await generationInputs(
      owner.id,
      body,
      Math.random,
      'summary',
      wikiReader(nextRequest),
    );
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

const statusRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
});

/**
 * `POST /v1/ai_chat/status_line` (the operator, 2026-11-21: campaigns told apart by "concise
 * descriptions maintained by campaign events"): the summary model writes one spoiler-safe sentence
 * from the rolling summary and the latest story lines only (features/chat/statusLine.ts), and the
 * chat keeps it, without touching its version. Call it at each session end and every
 * status_line.every_turns story turns. Answer `{ "status_line": { "text" } }`.
 */
export async function statusLine(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = statusRequest.safeParse(Reflect.get(envelope, 'status_line'));
    if (!parsed.success) throw validationError('A status_line object with a chat_id is required', 'status_line');
    const asked = parsed.data;
    const { prompt, sampler, endpoint, world } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'reply', endpoint_id: null, forbid: null },
      Math.random,
      'summary',
      wikiReader(nextRequest),
    );
    const story = new Set<string>(PROMPT.story_channels);
    const lines = prompt.history
      .filter((turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true)
      .map((turn) => stripMarkup(turn.content));
    const stream = await askModel(
      endpoint,
      upstreamBody(endpoint, sampler, statusMessages(prompt.summary ?? '', lines), 'reply'),
      nextRequest.signal,
    );
    // The same call keeps the stances (features/chat/dispositions.ts): no extra model call.
    const { line: text, updates } = parseStatus(
      await collect(completionDeltas(stream)).catch(() => {
        throw new ApiError(502, { message: 'The model stopped mid-line', code: 'model_refused' });
      }),
    );
    if (text === '') throw new ApiError(502, { message: 'The model gave no line', code: 'model_refused' });
    const chat = await chats.find(asked.chat_id, owner.id);
    const current = chat === null ? {} : ((chats.fields(chat) as { dispositions?: Dispositions }).dispositions ?? {});
    const people = world
      .filter((entity) => entity.kind === 'person')
      .map((entity) => ({ id: entity.id, name: entity.name }));
    const dispositions = applyStances(current, updates, people);
    await prisma.chat.updateMany({
      where: { id: asked.chat_id, createdById: owner.id },
      data: { statusLine: text, dispositions: JSON.stringify(dispositions) },
    });
    return Response.json({ status_line: { text, stances: updates.length } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const ensurePersonRequest = z.object({
  chat_id: z.string().min(1),
  name: z.string().trim().min(1).max(LIMITS.model_name_characters),
  line: z.string().max(2000).default(''),
});

/**
 * `POST /v1/ai_chat/ensure_person` (the operator's play-test: "her second line is still credited to the
 * narrator"): someone the narrator voiced who isn't a person yet becomes a GM-only wiki npc (the
 * wiki's own ensure, the same person if the name is there) and joins the chat's cast. Answer
 * `{ "ensure_person": { "id", "name", "created" } }`; 409 when the wiki can't (no campaign, not the GM).
 */
export async function ensurePerson(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = ensurePersonRequest.safeParse(Reflect.get(envelope, 'ensure_person'));
    if (!parsed.success)
      throw validationError('An ensure_person object with a chat_id and name is required', 'ensure_person');
    const asked = parsed.data;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const fields = chats.fields(chat) as { campaign_id: string | null; character_ids: string[] };
    const frameRow =
      fields.campaign_id === null
        ? null
        : await prisma.campaignFrame.findFirst({
            where: { OR: [{ id: fields.campaign_id }, { wikiCampaignId: fields.campaign_id }], createdById: owner.id },
          });
    const wikiCampaign = wikiCampaignOf(
      fields.campaign_id,
      new Map(frameRow === null ? [] : [[frameRow.id, frameRow.wikiCampaignId]]),
    );
    const person =
      wikiCampaign === null ? null : await wikiReader(nextRequest).ensurePerson(wikiCampaign, asked.name, asked.line.trim());
    if (person === null)
      throw new ApiError(409, { message: "The wiki can't make this person here", code: 'no_wiki_person' });
    if (!fields.character_ids.includes(person.id)) {
      await prisma.chat.updateMany({
        where: { id: chat.id, createdById: owner.id },
        data: { characterIds: JSON.stringify([...fields.character_ids, person.id]) },
      });
    }
    return Response.json({ ensure_person: person });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const genRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  speaker_id: z.string().min(1).nullable().default(null),
  prompt: z.string().trim().min(1).max(LIMITS.gen_prompt_characters),
  raw: z.boolean().default(false),
});

/**
 * `POST /v1/ai_chat/gen` (STscript's /gen and /genraw, audit gap 5): the chat's model's answer to an
 * instruction, with the chat's prompt before it (or alone, `raw`). Nothing is written: a script
 * pipes the text on, or /sysgen keeps it as a system line. Request `{ "gen": { "chat_id",
 * "leaf_id", "speaker_id", "prompt", "raw" } }`; answer `{ "gen": { "text" } }`.
 */
export async function gen(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = genRequest.safeParse(Reflect.get(envelope, 'gen'));
    if (!parsed.success) throw validationError('A gen object with a chat_id and a prompt is required', 'gen');
    const asked = parsed.data;
    const { prompt, sampler, endpoint } = await generationInputs(
      owner.id,
      {
        chat_id: asked.chat_id,
        leaf_id: asked.leaf_id,
        speaker_id: asked.speaker_id,
        mode: 'reply',
        endpoint_id: null,
        forbid: null,
      },
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
    const chat = asked.raw ? null : promptFor('reply', prompt);
    const messages = genMessages(chat?.messages ?? [], asked.prompt, asked.raw, chat?.prefill ?? '');
    const stream = await askModel(endpoint, upstreamBody(endpoint, sampler, messages, 'reply'), nextRequest.signal);
    const text = await collect(completionDeltas(stream)).catch(() => {
      throw new ApiError(502, { message: 'The model stopped mid-answer', code: 'model_refused' });
    });
    return Response.json({ gen: { text: text.trim() } });
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
      { chat_id: asked.chat_id, leaf_id: null, speaker_id: null, mode: 'reply', endpoint_id: null, forbid: null },
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

const nextTurnRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
});

/**
 * `POST /v1/ai_chat/next_turn` (the operator, 2026-11-21): who speaks next, by the decision model: a
 * character of the cast the AI plays, the AI GM interjecting, or a pause for the person's input,
 * told by the person's seat (features/chat/turnDecision.ts). Request `{ "next_turn": { "chat_id",
 * "leaf_id" } }`; answer `{ "next_turn": { "decided", "kind", "character_id" } }`. `decided` is false
 * (and the caller keeps its turn order) without a decision model or a usable answer. Nothing is written.
 */
export async function nextTurn(nextRequest: NextRequest): Promise<Response> {
  const undecided = Response.json({ next_turn: { decided: false, kind: null, character_id: null } });
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = nextTurnRequest.safeParse(Reflect.get(envelope, 'next_turn'));
    if (!parsed.success) throw validationError('A next_turn object with a chat_id is required', 'next_turn');
    const asked = parsed.data;
    const deciding = await decider(owner.id);
    if (deciding === null) return undecided;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const fields = chats.fields(chat) as { seat: string | null; muted_ids: string[]; vox_ids: string[] };
    const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
    const playingId = play?.playingId ?? null;
    const { prompt, world } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'narrate', endpoint_id: null, forbid: null },
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
    const player = prompt.persona?.name ?? DEFAULT_USER_NAME;
    const seat = turnSeat(fields.seat, playingId !== null);
    const names = new Map(prompt.characters.map((character) => [character.id, character.name]));
    const story = new Set<string>(PROMPT.story_channels);
    const storyTurns = prompt.history.filter(
      (turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true,
    );
    // Only those in the scene, or reached by vox, can be picked (the operator, 2026-11-21).
    const locations = world
      .filter((entity) => entity.kind === 'location' && entity.deleted !== true)
      .map((entity) => ({ ...entity, aliases: [...((entity as { aliases?: string[] }).aliases ?? [])] }));
    const at = sceneLocation(
      storyTurns.map((turn) => ({ text: turn.content, channel: 'story' })),
      locations,
    );
    const field = (entity: object, key: string): string | null => {
      const value: unknown = Reflect.get(entity, key);
      return typeof value === 'string' ? value : null;
    };
    const { present, vox } = presentCast(prompt.characters, {
      tokens: null,
      scene_location: at,
      location_parents: Object.fromEntries(locations.map((location) => [location.id, field(location, 'parent_id')])),
      person_locations: Object.fromEntries(
        world.filter((entity) => entity.kind === 'person').map((entity) => [entity.id, field(entity, 'location_id')]),
      ),
      recent: storyTurns.map((turn) => ({
        speaker_id: turn.role === 'user' ? playingId : turn.role === 'character' ? turn.speaker_character_id : null,
        text: turn.content,
      })),
      vox: fields.vox_ids,
    });
    // After the person's own line someone answers: no pause.
    const lastTurn = storyTurns.at(-1);
    const afterPerson = lastTurn !== undefined && byPerson(lastTurn, playingId);
    const { question, picks } = turnQuestion(
      prompt.characters,
      fields.muted_ids,
      playingId,
      seat,
      player,
      [...present, ...vox],
      afterPerson,
    );
    const named = (ids: readonly string[]) => ids.map((id) => names.get(id) ?? '').filter((name) => name !== '');
    const state = turnState(
      storyTurns.map((turn) => ({
        name:
          turn.role === 'user'
            ? player
            : turn.role === 'character'
              ? (names.get(turn.speaker_character_id ?? '') ?? PROMPT.narrator_name)
              : TABLE.gm_name,
        text: turn.content,
      })),
      {
        place: locations.find((location) => location.id === at)?.name ?? null,
        present: named(present),
        vox: named(vox),
      },
    );
    const answers = await askDecider(deciding, state, { next: question }, nextRequest.signal);
    const pick = turnPick(answers?.next, picks);
    if (pick === null) return undecided;
    return Response.json({
      next_turn: { decided: true, kind: pick.kind, character_id: pick.kind === 'character' ? pick.id : null },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const needsRollRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  character_id: z.string().min(1),
});

/**
 * `POST /v1/ai_chat/needs_roll` (the operator, 2026-11-21; DESIGN's needs_roll): after a character's
 * line, whether it needs a roll and which (features/chat/rollDecision.ts). Lite has no VTT system
 * pack, so it decides in the light dice style. Request `{ "needs_roll": { "chat_id", "leaf_id",
 * "character_id" } }`; answer `{ "needs_roll": { "decided", "kind": none|test|formula, "person_id",
 * "name", "difficulty", "formula", "label" } }`. The caller rolls it, posts the roll line, and has the
 * narrator narrate it. Nothing is written.
 */
export async function needsRoll(nextRequest: NextRequest): Promise<Response> {
  const blank = { person_id: null, name: null, difficulty: null, formula: null, label: null, source: null };
  const undecided = Response.json({ needs_roll: { decided: false, kind: null, ...blank } });
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = needsRollRequest.safeParse(Reflect.get(envelope, 'needs_roll'));
    if (!parsed.success)
      throw validationError('A needs_roll object with a chat_id and character_id is required', 'needs_roll');
    const asked = parsed.data;
    const deciding = await decider(owner.id);
    if (deciding === null) return undecided;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const fields = chats.fields(chat) as { campaign_id: string | null };
    const frame =
      fields.campaign_id === null
        ? null
        : await prisma.campaignFrame.findFirst({
            where: { OR: [{ id: fields.campaign_id }, { wikiCampaignId: fields.campaign_id }], createdById: owner.id },
          });
    const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
    const playingId = play?.playingId ?? null;
    const { prompt } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'narrate', endpoint_id: null, forbid: null },
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
    const player = prompt.persona?.name ?? DEFAULT_USER_NAME;
    const names = new Map(prompt.characters.map((character) => [character.id, character.name]));
    const actor = asked.character_id === playingId ? player : names.get(asked.character_id);
    if (actor === undefined) throw validationError('The character must be in the chat', 'character_id');
    const options = null;
    const story = new Set<string>(PROMPT.story_channels);
    // The actor's latest story line: an attempt at something uncertain always gets a test.
    const acted = [...prompt.history]
      .reverse()
      .find(
        (turn) =>
          story.has(turn.channel) &&
          (asked.character_id === playingId ? byPerson(turn, playingId) : turn.speaker_character_id === asked.character_id),
      );
    // The play-test: a laugh about a fireplace got a roll. No attempt, no roll, and no model call.
    if (acted === undefined || !isAttempt(acted.content))
      return Response.json({ needs_roll: { decided: true, kind: 'none', ...blank } });
    const { questions, picks } = rollQuestions(options, frame?.resolutionMode ?? 'narrative', actor, true);
    const state = turnState(
      prompt.history
        .filter((turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true)
        .map((turn) => ({
          name:
            turn.role === 'user'
              ? player
              : turn.role === 'character'
                ? (names.get(turn.speaker_character_id ?? '') ?? PROMPT.narrator_name)
                : TABLE.gm_name,
          text: turn.content,
        })),
    );
    // No system, no roll (the operator: mechanics are never a model's): lite has no VTT pack.
    if (Object.keys(questions).length === 0) return Response.json({ needs_roll: { decided: true, kind: 'none', ...blank } });
    const pick = rollPick(await askDecider(deciding, state, questions, nextRequest.signal), picks, options);
    if (pick === null) return undecided;
    return Response.json({
      needs_roll: {
        decided: true,
        kind: pick.kind,
        ...blank,
        ...(pick.kind === 'none' ? {} : { person_id: asked.character_id, label: pick.label }),
        source: pick.kind === 'test' ? pick.source : null,
        ...(pick.kind === 'test' ? { name: pick.name, difficulty: pick.difficulty } : {}),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const worldTickRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
  minutes: z.number().int().min(1).max(525_600),
  reason: z.string().max(200).default(''),
});

/**
 * `POST /v1/ai_chat/world_tick` (the operator, 2026-11-21: "Each character should have its own routine
 * and motivations and the GM/decision agent should pilot them on the map as time advances"). The
 * wiki campaign's clock moves on by `minutes` (the GM's alone: for anyone else nothing happens), then
 * each NPC not in the scene, not of the party and not the seat goes where the decision model picks
 * among real places (features/world/worldTick.ts), else where its routine says, through the wiki's
 * person moves. Request `{ "world_tick": { "chat_id", "leaf_id", "minutes", "reason" } }`; answer
 * `{ "world_tick": { "skipped", "reason", "now", "moves", "arrivals" } }`: arrivals came into the
 * party's scene, for the caller to narrate.
 */
export async function worldTick(nextRequest: NextRequest): Promise<Response> {
  const skipped = (reason: string) =>
    Response.json({ world_tick: { skipped: true, reason, now: null, moves: [], arrivals: [] } });
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = worldTickRequest.safeParse(Reflect.get(envelope, 'world_tick'));
    if (!parsed.success) throw validationError('A world_tick object with a chat_id and minutes is required', 'world_tick');
    const asked = parsed.data;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const fields = chats.fields(chat) as { campaign_id: string | null; character_ids: string[]; vox_ids: string[] };
    const frameRow =
      fields.campaign_id === null
        ? null
        : await prisma.campaignFrame.findFirst({
            where: { OR: [{ id: fields.campaign_id }, { wikiCampaignId: fields.campaign_id }], createdById: owner.id },
          });
    const wikiCampaign = wikiCampaignOf(
      fields.campaign_id,
      new Map(frameRow === null ? [] : [[frameRow.id, frameRow.wikiCampaignId]]),
    );
    if (wikiCampaign === null) return skipped('no wiki campaign');
    const reader = wikiReader(nextRequest);
    const reason = asked.reason.trim() || 'time passes';
    const clock = await reader.advanceClock(wikiCampaign, asked.minutes, reason);
    if (clock === null) return skipped('only the GM moves the clock');
    const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
    const playingId = play?.playingId ?? null;
    const { prompt, world } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'narrate', endpoint_id: null, forbid: null },
      Math.random,
      'reply',
      reader,
    );
    const story = new Set<string>(PROMPT.story_channels);
    const storyTurns = prompt.history.filter(
      (turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true,
    );
    const field = (entity: object, key: string): unknown => Reflect.get(entity, key);
    const locations = world
      .filter((entity) => entity.kind === 'location' && entity.deleted !== true)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        parent_id: (field(entity, 'parent_id') as string | null | undefined) ?? null,
        aliases: [...((field(entity, 'aliases') as string[] | undefined) ?? [])],
      }));
    const at = sceneLocation(
      storyTurns.map((turn) => ({ text: turn.content, channel: 'story' })),
      locations,
    );
    const { present } = presentCast(prompt.characters, {
      tokens: null,
      scene_location: at,
      location_parents: Object.fromEntries(locations.map((location) => [location.id, location.parent_id])),
      person_locations: Object.fromEntries(
        world
          .filter((entity) => entity.kind === 'person')
          .map((entity) => [entity.id, (field(entity, 'location_id') as string | null | undefined) ?? null]),
      ),
      recent: storyTurns.map((turn) => ({
        speaker_id: turn.role === 'user' ? playingId : turn.role === 'character' ? turn.speaker_character_id : null,
        text: turn.content,
      })),
      vox: fields.vox_ids,
    });
    // The party travels with the person; those in the scene stay; the seat is the person's.
    const still = [
      ...present,
      ...partyOf(world, fields.character_ids, playingId).map((one) => one.id),
      ...(playingId === null ? [] : [playingId]),
    ];
    const persons: TickPerson[] = world
      .filter((entity) => entity.kind === 'person' && entity.deleted !== true)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        location_id: (field(entity, 'location_id') as string | null | undefined) ?? null,
        routine: (field(entity, 'routine') as RoutineSlot[] | null | undefined) ?? null,
        motivations: (field(entity, 'motivations') as string[] | null | undefined) ?? null,
      }));
    const { questions, picks, fallbacks } = tickQuestions(persons, locations, clock, still);
    const deciding = Object.keys(questions).length === 0 ? null : await decider(owner.id);
    const place = locations.find((location) => location.id === at)?.name ?? null;
    const answers =
      deciding === null ? null : await askDecider(deciding, tickState(clock, place), questions, nextRequest.signal);
    const moves: Move[] = [];
    for (const move of tickMoves(answers, picks, fallbacks, persons)) {
      if (await reader.movePerson(move.person_id, move.to, reason)) moves.push(move);
    }
    return Response.json({
      world_tick: { skipped: false, reason: null, now: clock, moves, arrivals: arrivals(moves, at, locations) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const clarifyRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
});

/**
 * `POST /v1/ai_chat/clarify` (the operator, 2026-11-21: "We need question tool support for ambiguity"):
 * when the person's latest do line names no target and two or more are present, one decide call says
 * whether it's truly ambiguous; then `{ "clarify": { "question", "options": [{ "label", "value" }] } }`,
 * the options only those present, for the GM to ask out of game. `{ "clarify": null }` otherwise, and
 * for free when no line could need it (features/chat/clarify.ts).
 */
export async function clarify(nextRequest: NextRequest): Promise<Response> {
  const none = Response.json({ clarify: null });
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = clarifyRequest.safeParse(Reflect.get(envelope, 'clarify'));
    if (!parsed.success) throw validationError('A clarify object with a chat_id is required', 'clarify');
    const asked = parsed.data;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const fields = chats.fields(chat) as { vox_ids: string[] };
    const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
    const playingId = play?.playingId ?? null;
    if (playingId === null) return none;
    const { prompt, world } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'narrate', endpoint_id: null, forbid: null },
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
    const story = new Set<string>(PROMPT.story_channels);
    const storyTurns = prompt.history.filter(
      (turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true,
    );
    const last = storyTurns.at(-1);
    if (last === undefined || !byPerson(last, playingId)) return none;
    const actor = prompt.persona?.name ?? DEFAULT_USER_NAME;
    const people = [...prompt.characters, { id: playingId, name: actor }];
    const field = (entity: object, key: string): unknown => Reflect.get(entity, key);
    const locations = world
      .filter((entity) => entity.kind === 'location' && entity.deleted !== true)
      .map((entity) => ({ ...entity, aliases: [...((field(entity, 'aliases') as string[] | undefined) ?? [])] }));
    const at = sceneLocation(
      storyTurns.map((turn) => ({ text: turn.content, channel: 'story' })),
      locations,
    );
    const persons = world
      .filter((entity) => entity.kind === 'person' && entity.deleted !== true && entity.id !== playingId)
      .map((entity) => ({ id: entity.id, name: entity.name }));
    const { present } = presentCast(persons, {
      tokens: null,
      scene_location: at,
      location_parents: Object.fromEntries(
        locations.map((location) => [location.id, (field(location, 'parent_id') as string | null | undefined) ?? null]),
      ),
      person_locations: Object.fromEntries(
        world
          .filter((entity) => entity.kind === 'person')
          .map((entity) => [entity.id, (field(entity, 'location_id') as string | null | undefined) ?? null]),
      ),
      recent: storyTurns.map((turn) => ({
        speaker_id: turn.role === 'user' ? playingId : turn.role === 'character' ? turn.speaker_character_id : null,
        text: turn.content,
      })),
      vox: fields.vox_ids,
    });
    const candidates = persons.filter((person) => present.includes(person.id));
    const need = clarifyNeed(parsePlayerLines(last.content, people), playingId, candidates);
    if (need === null) return none;
    const deciding = await decider(owner.id);
    if (deciding === null) return none;
    const { decide, player } = clarifyQuestions(need.action, actor, candidates);
    const answers = await askDecider(
      deciding,
      storyTurns
        .map((turn) => turn.content)
        .slice(-6)
        .join('\n'),
      { ambiguous: decide },
      nextRequest.signal,
    );
    return shouldAsk(answers?.ambiguous) ? Response.json({ clarify: player }) : none;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const mapStepRequest = z.object({
  chat_id: z.string().min(1),
  leaf_id: z.string().min(1).nullable().default(null),
});

/**
 * `POST /v1/ai_chat/map_step` (the operator, 2026-11-21: "The GM needs to update the map based on what
 * I say in narrative mode"): the latest round's do lines with a movement word (free to find; no model
 * call without one) each get one decide question among real places (features/world/mapStep.ts); the
 * moves go through the wiki's person moves, the GM's alone. Answer `{ "map_step": { "skipped",
 * "reason", "moves": [{ "person_id", "from", "to", "to_name" }], "seat_location": { "id", "name" } |
 * null, "seat_moved" } }`: the banner's place, server truth, never the narrator's word.
 */
export async function mapStep(nextRequest: NextRequest): Promise<Response> {
  try {
    const owner = localOwner(nextRequest);
    const envelope = await readJsonObject(nextRequest);
    const parsed = mapStepRequest.safeParse(Reflect.get(envelope, 'map_step'));
    if (!parsed.success) throw validationError('A map_step object with a chat_id is required', 'map_step');
    const asked = parsed.data;
    const chat = await chats.find(asked.chat_id, owner.id);
    if (chat === null) throw notFound(chats.modelName);
    const play = await prisma.campaignPlay.findUnique({ where: { chatId: chat.id } });
    const playingId = play?.playingId ?? null;
    const reader = wikiReader(nextRequest);
    const { prompt, world } = await generationInputs(
      owner.id,
      { chat_id: asked.chat_id, leaf_id: asked.leaf_id, speaker_id: null, mode: 'narrate', endpoint_id: null, forbid: null },
      Math.random,
      'reply',
      reader,
    );
    const story = new Set<string>(PROMPT.story_channels);
    const storyTurns = prompt.history.filter(
      (turn) => story.has(turn.channel) && turn.x_carded !== true && turn.hidden !== true,
    );
    // The latest round: from the person's last line on.
    const from = storyTurns.findLastIndex((turn) => byPerson(turn, playingId));
    const round = from === -1 ? storyTurns : storyTurns.slice(from);
    const actor = prompt.persona?.name ?? DEFAULT_USER_NAME;
    const people = [...prompt.characters, ...(playingId === null ? [] : [{ id: playingId, name: actor }])];
    const field = (entity: object, key: string): unknown => Reflect.get(entity, key);
    const locations = world
      .filter((entity) => entity.kind === 'location' && entity.deleted !== true)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        parent_id: (field(entity, 'parent_id') as string | null | undefined) ?? null,
        aliases: [...((field(entity, 'aliases') as string[] | undefined) ?? [])],
      }));
    const persons = world
      .filter((entity) => entity.kind === 'person' && entity.deleted !== true)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        location_id: (field(entity, 'location_id') as string | null | undefined) ?? null,
      }));
    // The banner's place is server truth (the operator, 2026-11-21), on every answer.
    const answer = (
      moves: { person_id: string; from: string | null; to: string; to_name: string }[],
      reason: string | null,
    ) =>
      Response.json({
        map_step: { skipped: reason !== null, reason, moves, ...seatPlace(playingId, persons, locations, moves) },
      });
    const moving = movers(round.flatMap((turn) => parsePlayerLines(turn.content, people)));
    if (moving.length === 0) return answer([], 'nobody moved');
    const { questions, picks, fallbacks } = mapQuestions(moving, persons, locations);
    if (Object.keys(questions).length === 0) return answer([], 'nowhere to go');
    const deciding = await decider(owner.id);
    if (deciding === null) return answer([], 'no decision model');
    const answers = await askDecider(deciding, round.map((turn) => turn.content).join('\n'), questions, nextRequest.signal);
    const moves: { person_id: string; from: string | null; to: string; to_name: string }[] = [];
    for (const move of tickMoves(answers, picks, fallbacks, persons)) {
      if (await reader.movePerson(move.person_id, move.to, 'the story moved them')) {
        moves.push({ ...move, to_name: locations.find((location) => location.id === move.to)?.name ?? move.to });
      }
    }
    return answer(moves, null);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Whether a line is the person's own: a user line, or, in a campaign, their seat's character line (the
 * client saves a seated person's lines as the seat's; Zephyrex RPG's build37 run: no roll ever).
 */
export function byPerson(turn: { role: string; speaker_character_id?: string | null }, playingId: string | null): boolean {
  return turn.role === 'user' || (playingId !== null && turn.role === 'character' && turn.speaker_character_id === playingId);
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
    // Anthropic's and Google's own APIs (audit gap 8) list their models in their own shape.
    const native = isNativeApi(row.api) ? nativeModelsRequest(row.api, row.baseUrl, row.apiKey) : null;
    const answer = await fetch(native?.url ?? modelsUrl(row.baseUrl), {
      headers: native?.headers ?? (row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
      signal: AbortSignal.any([nextRequest.signal, AbortSignal.timeout(PING_TIMEOUT_MS)]),
    }).catch(() => null);
    const latency = Date.now() - started;
    if (answer === null)
      return Response.json({
        ping: { ok: false, latency_ms: latency, status: null, has_model: null, detail: 'The server could not be reached' },
      });
    const body: unknown = await answer.json().catch(() => null);
    const listed: unknown = Reflect.get(Object(body), 'data');
    const ids = isNativeApi(row.api)
      ? nativeModelIds(row.api, body)
      : Array.isArray(listed)
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
      { chat_id: asked.chat_id, leaf_id: null, speaker_id: null, mode: 'reply', endpoint_id: null, forbid: null },
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
async function picturePrompt(
  ownerId: string,
  asked: z.infer<typeof pictureRequest>,
  world: WorldReader = NO_WORLD,
): Promise<string> {
  if (asked.kind === 'portrait') {
    const row = await characters.find(asked.character_id ?? '', ownerId);
    if (row === null) throw notFound(characters.modelName);
    const fields = characters.fields(row) as { name: string; description: string };
    return portraitPicturePrompt(fields, asked.prompt);
  }
  const { prompt: input, place } = await generationInputs(
    ownerId,
    {
      chat_id: asked.chat_id ?? '',
      leaf_id: asked.leaf_id,
      speaker_id: null,
      mode: 'reply',
      endpoint_id: null,
      forbid: null,
    },
    Math.random,
    'reply',
    world,
  );
  return asked.kind === 'background'
    ? backgroundPicturePrompt(input, place, asked.prompt)
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
    const prompt = await picturePrompt(owner.id, asked, wikiReader(nextRequest));
    const answer = await fetch(imagesUrl(row.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
      },
      body: JSON.stringify(
        withExtraBody(
          {
            model: row.model,
            prompt,
            n: 1,
            size: row.imageSize === '' ? PICTURE.size : row.imageSize,
            response_format: 'b64_json',
          },
          storedExtraBody(row.extraBody),
        ),
      ),
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
    const { prompt, sampler, endpoint, loreState, images, paused, lines, speaker } = await generationInputs(
      owner.id,
      body,
      Math.random,
      'reply',
      wikiReader(nextRequest),
    );
    // Paused (A25): no story turns until the table resumes. The table GM still answers.
    if (paused && body.mode !== 'table')
      throw new ApiError(409, { message: 'The table has paused the game', code: 'paused' });
    const assembled = promptFor(body.mode, await withMemories(owner.id, body, prompt, lines, speaker, nextRequest.signal));
    // The lore timers move with the reply that read them, and so do the variables its macros set.
    await saveLoreState(owner.id, body.chat_id, loreState);
    await saveVariables(owner.id, body.chat_id, prompt.macros?.local ?? {}, assembled.variables?.local);

    // "Start reply with" (audit gap 3): a text API carries on from it, as from a reply being continued.
    const prefill = assembled.prefill ?? '';
    const mode = prefill !== '' ? 'continue' : body.mode === 'table' ? 'reply' : body.mode;
    const upstream = await askModel(
      endpoint,
      upstreamBody(endpoint, sampler, assembled.messages, mode, images),
      nextRequest.signal,
    );
    const deltas = completionDeltas(upstream);
    // A runaway stops at the blank line after the paragraph limit (voiceGuard.ts paragraphCut): a
    // structural stop, never mid-sentence (the operator, 2026-11-22).
    let told = '';
    const stream = new ReadableStream<Uint8Array>({
      // The reply begins with its prefill, so what's kept is the whole reply.
      start(controller) {
        if (prefill !== '') controller.enqueue(event('delta', { text: prefill }));
      },
      async pull(controller) {
        try {
          const next = await deltas.next();
          const cut = next.done ? -1 : paragraphCut(told + next.value);
          if (next.done || cut >= 0) {
            const rest = cut >= 0 ? (told + next.value).slice(told.length, Math.max(cut, told.length)) : '';
            if (rest !== '') controller.enqueue(event('delta', { text: rest }));
            if (cut >= 0) await deltas.return(undefined);
            controller.enqueue(event('done', { dropped: assembled.dropped }));
            controller.close();
          } else {
            told += next.value;
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
