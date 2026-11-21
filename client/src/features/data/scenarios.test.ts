// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('zephyrex', () => ({ useClient: () => ({}) }));

const { groupScenarios, NO_SETTING, NO_SYSTEM } = await import('./scenarios');

const scenario = (id: string, setting_id: string | null, game_system_id: string | null) => ({
  id,
  name: id,
  description: null,
  setting_id,
  game_system_id,
});

describe('groupScenarios', () => {
  it('groups by setting, then by system, A–Z, with the ungrouped last', () => {
    const groups = groupScenarios(
      [
        scenario('Voidship Escapade', '40k', 'dh2'),
        scenario('Solenne', '40k', 'dh2'),
        scenario('The Split Antler', 'fr', 'dnd5'),
        scenario('Loose', null, null),
        scenario('Narrative', '40k', null),
      ],
      [
        { id: '40k', name: 'Warhammer 40,000' },
        { id: 'fr', name: 'Forgotten Realms' },
      ],
      [
        { id: 'dh2', name: 'Dark Heresy 2nd Edition' },
        { id: 'dnd5', name: 'D&D 5e' },
      ],
    );
    expect(
      groups.map((one) => [one.setting, one.systems.map((system) => [system.system, system.scenarios.map((s) => s.id)])]),
    ).toEqual([
      ['Forgotten Realms', [['D&D 5e', ['The Split Antler']]]],
      [
        'Warhammer 40,000',
        [
          ['Dark Heresy 2nd Edition', ['Solenne', 'Voidship Escapade']],
          [NO_SYSTEM, ['Narrative']],
        ],
      ],
      [NO_SETTING, [[NO_SYSTEM, ['Loose']]]],
    ]);
  });

  it('an unknown setting or system id falls into the ungrouped', () => {
    const groups = groupScenarios([scenario('A', 'gone', 'gone')], [], []);
    expect(groups).toEqual([{ setting: NO_SETTING, systems: [{ system: NO_SYSTEM, scenarios: [scenario('A', 'gone', 'gone')] }] }]);
  });
});
