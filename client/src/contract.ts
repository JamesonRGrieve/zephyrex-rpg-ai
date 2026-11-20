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
    'lore_before_char',
    'description',
    'personality',
    'scenario',
    'lore_after_char',
    'persona',
    'lore_before_example',
    'examples',
    'lore_after_example',
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
export const SELECTIVE_LOGIC = contract.lore.selective_logic as unknown as readonly ['and_any', 'not_all', 'not_any', 'and_all'];
export const DEPTH_ROLES = contract.lore.depth_roles as unknown as readonly ['system', 'user', 'assistant'];
export type LorePosition = (typeof LORE_POSITIONS)[number];
export type SelectiveLogic = (typeof SELECTIVE_LOGIC)[number];
export type DepthRole = (typeof DEPTH_ROLES)[number];

/** Text-completion prompt markup (features/prompt/instruct.ts; cases in contract/instruct-cases.json). */
export const INSTRUCT_TEMPLATES = contract.instruct_templates;
export type InstructTemplateId = keyof typeof INSTRUCT_TEMPLATES;
export const ENDPOINT_APIS = contract.endpoint_apis as unknown as readonly ['chat', 'text'];
export type EndpointApi = (typeof ENDPOINT_APIS)[number];
