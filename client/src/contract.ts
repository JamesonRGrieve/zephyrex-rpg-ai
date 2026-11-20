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
export const PROMPT = contract.prompt;
