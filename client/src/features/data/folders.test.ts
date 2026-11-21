// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('zephyrex', () => ({ useClient: () => ({}) }));

const { folderOf } = await import('./folders');

const settings = [{ id: '40k', name: 'Warhammer 40,000' }];
const campaigns = [
  { id: 'void', name: 'Voidship Escapade', setting_id: '40k', scenario_id: null },
  { id: 'run1', name: 'Voidship Escapade', setting_id: '40k', scenario_id: 'void' },
];

describe('folderOf', () => {
  it('canon by setting, a scenario default under its scenario, a campaign copy under its campaign', () => {
    expect(folderOf({ id: 'a', campaign_id: null, setting_id: '40k' }, campaigns, settings)).toBe('Warhammer 40,000');
    expect(folderOf({ id: 'b', campaign_id: 'void' }, campaigns, settings)).toBe('Warhammer 40,000 / Voidship Escapade');
    expect(folderOf({ id: 'c', campaign_id: 'run1' }, campaigns, settings)).toBe(
      'Warhammer 40,000 / Voidship Escapade / Voidship Escapade',
    );
  });
  it('no setting when none is known', () => {
    expect(folderOf({ id: 'd', campaign_id: null, setting_id: null }, campaigns, settings)).toBe('No setting');
  });
});
