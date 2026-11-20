// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { LITE_EXTENSIONS } from '~/app/api/v1/extension/route.lite';
import { capabilitiesOf } from './capabilities';

describe('capabilitiesOf', () => {
  it('turns on what the lite back end lists, and nothing it does not', () => {
    const lite = capabilitiesOf(new Set(LITE_EXTENSIONS.map((extension) => extension.name)), true);
    expect(lite).toEqual({ loaded: true, characters: true, lorebooks: true, chats: true, campaigns: true, accounts: false, world: false, table: false });
  });

  it('finds the world and the table when their products are loaded beside this one', () => {
    const suite = capabilitiesOf(new Set(['ai_character', 'ai_chat', 'auth_session', 'rpg_log', 'rpg_state']), true);
    expect(suite).toMatchObject({ accounts: true, world: true, table: true });
  });
});
