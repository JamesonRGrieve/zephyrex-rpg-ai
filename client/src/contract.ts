// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Zephyrex RPG AI's shared knowledge, from the one file the SaaS server reads too
 * (contract/rpg_ai.json at the repository root): record limits, message roles and channels,
 * chat modes, the character-card spec ids, sampler ranges and defaults. The UI and the lite API
 * use these, never copies of their values.
 */
import contract from '../../contract/rpg_ai.json';

export const LIMITS = contract.limits;
export const CARD_SPECS = contract.card_specs;
export const SAMPLER_RANGES = contract.sampler_ranges;
export const PRESET_DEFAULTS = contract.preset_defaults;
export const PAID_FEATURE_IDS: Readonly<Record<string, string>> = contract.paid_features;

/** The tuple types are checked against the contract in contract.test.ts. */
export const MESSAGE_ROLES = contract.message_roles as unknown as readonly ['user', 'character', 'narrator', 'system'];
export const MESSAGE_CHANNELS = contract.message_channels as unknown as readonly ['ic', 'ooc', 'gm', 'roll', 'system'];
export const CHAT_MODES = contract.chat_modes as unknown as readonly ['character', 'group'];

export type MessageRole = (typeof MESSAGE_ROLES)[number];
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export type ChatMode = (typeof CHAT_MODES)[number];
export type SamplerSetting = keyof typeof SAMPLER_RANGES;

/** How a prompt is assembled (features/prompt/assemble.ts; cases in contract/prompt-cases.json). */
export const PROMPT = {
  ...contract.prompt,
  sections: contract.prompt.sections as unknown as readonly [
    'main',
    'safety',
    'table_notes',
    'campaign',
    'running_scenario',
    'lore_before_char',
    'description',
    'personality',
    'scenario',
    'lore_after_char',
    'persona',
    'lore_before_example',
    'examples',
    'lore_after_example',
    'data_bank',
    'memories',
    'summary',
    'author_note',
    'post_history',
  ],
};

/** World Info: positions, logic, defaults and ranges (features/lore/activate.ts; cases in contract/lore-cases.json). */
export const LORE = contract.lore;
export const LORE_POSITIONS = contract.lore.positions as unknown as readonly [
  'before_char',
  'after_char',
  'before_example',
  'after_example',
  'before_an',
  'after_an',
  'at_depth',
];
export const SELECTIVE_LOGIC = contract.lore.selective_logic as unknown as readonly [
  'and_any',
  'not_all',
  'not_any',
  'and_all',
];
export const DEPTH_ROLES = contract.lore.depth_roles as unknown as readonly ['system', 'user', 'assistant'];
export type LorePosition = (typeof LORE_POSITIONS)[number];
export type SelectiveLogic = (typeof SELECTIVE_LOGIC)[number];
export type DepthRole = (typeof DEPTH_ROLES)[number];

/** Logit bias and CFG (A47): passed to the model only when set. */
export const SAMPLER_EXTRAS = contract.sampler_extras;
/** One of SillyTavern's further samplers (audit gap 2): its range, its off value, its names on the wire, the APIs that take it. */
export interface SamplerParam {
  name: string;
  kind: 'number' | 'integer' | 'strings';
  range: readonly [number, number];
  neutral: number | readonly string[];
  wire: readonly string[];
  apis: readonly ('chat' | 'text' | 'horde')[];
  group: string;
  requires?: string;
}
/** The further samplers, in the order the preset editor shows them (cases in contract/sampler-cases.json). */
export const SAMPLERS = {
  ...contract.samplers,
  params: contract.samplers.params as unknown as readonly SamplerParam[],
};

/** Text-completion prompt markup (features/prompt/instruct.ts; cases in contract/instruct-cases.json). */
export const INSTRUCT_TEMPLATES = contract.instruct_templates;
export type InstructTemplateId = keyof typeof INSTRUCT_TEMPLATES;
export const ENDPOINT_APIS = contract.endpoint_apis as unknown as readonly ['chat', 'text', 'horde'];
/** A person's own instruct template (A17): its fields and their limits. */
export const INSTRUCT_CUSTOM = contract.instruct_custom;
/** AI Horde (A48): where a text job is submitted and polled, and how long to wait. */
export const HORDE = contract.horde;
/** What a model can be used for (A27): replies, the GM's voices, summaries, translation, pictures, speech, search, embeddings, decisions. */
export const ENDPOINT_ROLES = contract.endpoint_roles as unknown as readonly [
  'story',
  'gm',
  'summary',
  'translate',
  'image',
  'voice',
  'search',
  'embed',
  'decide',
];
/** Web search sources (A42), kept as endpoints serving only the search role (cases in contract/search-cases.json). */
export const SEARCH_APIS = contract.search_apis as unknown as readonly ['searxng', 'brave'];
export type SearchApi = (typeof SEARCH_APIS)[number];
/** Whether an endpoint is a search source rather than a model. */
export const isSearchApi = (api: string): api is SearchApi => (SEARCH_APIS as readonly string[]).includes(api);
/** Server voices (A29): a line read aloud by a model set to speak (cases in contract/speech-cases.json). */
export const SPEECH = {
  ...contract.speech,
  speed_range: contract.speech.speed_range as unknown as readonly [number, number],
};
/** Recall by meaning (A19): a chat's older lines, embedded and recalled (cases in contract/memory-cases.json). */
export const MEMORY = contract.memory;
export type EndpointRole = (typeof ENDPOINT_ROLES)[number];
export type EndpointApi = (typeof ENDPOINT_APIS)[number];
/** What an endpoint record's api can be: a model API, or a search source (A42). */
export type EndpointKind = EndpointApi | SearchApi;
export const ENDPOINT_KINDS = [...ENDPOINT_APIS, ...SEARCH_APIS] as const;

/** Regex scripts (features/chat/regex.ts; cases in contract/regex-cases.json). */
export const REGEX = {
  ...contract.regex,
  placements: contract.regex.placements as unknown as readonly ['user_input', 'ai_output'],
  targets: contract.regex.targets as unknown as readonly ['stored', 'display', 'prompt'],
};

/** Reasoning (thinking) tag pairs, shown folded and never read back to the model (A45). */
export const REASONING = contract.reasoning;

/** Quick replies: what a button does and where its line goes. */
export const QUICK_REPLY = {
  actions: contract.quick_reply.actions as unknown as readonly ['send', 'fill'],
  channels: contract.quick_reply.channels as unknown as readonly ['ic', 'ooc'],
  /** When a quick reply runs by itself (A38); only `sending_auto_runs` may send. */
  auto_runs: contract.quick_reply.auto_runs as unknown as readonly ['none', 'chat_open', 'after_send', 'after_reply'],
  sending_auto_runs: contract.quick_reply.sending_auto_runs as unknown as readonly ['none', 'chat_open'],
};
export type QuickReplyAutoRun = (typeof QUICK_REPLY.auto_runs)[number];

/** The data bank: chunking, retrieval and its place in the prompt (features/chat/dataBank.ts). */
export const DATA_BANK = {
  ...contract.data_bank,
  scopes: contract.data_bank.scopes as unknown as readonly ['global', 'chat', 'character'],
};

/** Table safety: content ratings, lines and veils (A25). */
export const SAFETY = {
  ...contract.safety,
  ratings: contract.safety.ratings as unknown as readonly ['general', 'teen', 'mature'],
};

/** The table: note kinds and the table GM's prompt (A11, A20). */
export const TABLE = {
  ...contract.table,
  note_kinds: contract.table.note_kinds as unknown as readonly ['house_rule', 'pacing', 'tone', 'reminder'],
};

/** Campaign framing (A57): tone dials, pillars, structures and resolution modes. */
export const CAMPAIGN = {
  ...contract.campaign,
  pillars: contract.campaign.pillars as unknown as readonly ['combat', 'exploration', 'social', 'mystery'],
  structures: contract.campaign.structures as unknown as readonly ['sandbox', 'linear', 'episodic', 'one_shot'],
  resolution_modes: contract.campaign.resolution_modes as unknown as readonly ['narrative', 'mechanical', 'hybrid'],
};

/** Scenario modeling (A59–A61): clocks, clues and the GM's view of a running scenario. */
export const SCENARIO = contract.scenario;

/** Expression sprites (A4): how a line's feeling is asked for, and the labels' limits. */
export const EXPRESSION = contract.expression;

/** Pictures of the scene (A30): what the image model is asked for, and at what size. */
export const PICTURE = contract.picture;
