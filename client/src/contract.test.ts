// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import contract from '../../contract/rpg_ai.json';
import { CHAT_MODES, MESSAGE_CHANNELS, MESSAGE_ROLES, PRESET_DEFAULTS, SAMPLER_RANGES } from './contract';

describe('contract', () => {
  it('casts the enum tuples to exactly what the contract lists', () => {
    expect(MESSAGE_ROLES).toEqual(['user', 'character', 'narrator', 'system']);
    expect(MESSAGE_CHANNELS).toEqual(['ic', 'ooc', 'gm', 'roll', 'system']);
    expect(CHAT_MODES).toEqual(['character', 'group']);
    expect([...MESSAGE_ROLES]).toEqual(contract.message_roles);
    expect([...MESSAGE_CHANNELS]).toEqual(contract.message_channels);
    expect([...CHAT_MODES]).toEqual(contract.chat_modes);
  });

  it('keeps every preset default inside its sampler range', () => {
    for (const [setting, value] of Object.entries(PRESET_DEFAULTS)) {
      const [low, high] = SAMPLER_RANGES[setting as keyof typeof SAMPLER_RANGES];
      expect(value).toBeGreaterThanOrEqual(low);
      expect(value).toBeLessThanOrEqual(high);
    }
  });
});
