// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('zephyrex', () => ({ useClient: () => ({}) }));

const { campaignLine, groupScenarios, NO_SETTING, NO_SYSTEM, taggedWith, withTags } = await import('./scenarios');

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
    expect(groups).toEqual([{ setting: NO_SETTING, settingId: null, systems: [{ system: NO_SYSTEM, scenarios: [scenario('A', 'gone', 'gone')] }] }]);
  });
});

describe('withTags and taggedWith', () => {
  const scenarios = [scenario('a', null, null), scenario('b', null, null)];
  const styles = [
    { id: 't1', name: 'mystery' },
    { id: 't2', name: 'combat-heavy' },
  ];
  const tagged = [
    { taxon_id: 't2', target_entity_id: 'a' },
    { taxon_id: 't1', target_entity_id: 'a' },
    { taxon_id: 't1', target_entity_id: 'b' },
    { taxon_id: 'gone', target_entity_id: 'b' },
  ];
  it('each scenario gets its play styles by name, A–Z, unknown taxa left out', () => {
    expect(withTags(scenarios, styles, tagged).map((one) => one.tags)).toEqual([['combat-heavy', 'mystery'], ['mystery']]);
  });
  it('filtering keeps the scenarios carrying every wanted style', () => {
    const all = withTags(scenarios, styles, tagged);
    expect(taggedWith(all, []).map((one) => one.id)).toEqual(['a', 'b']);
    expect(taggedWith(all, ['mystery', 'combat-heavy']).map((one) => one.id)).toEqual(['a']);
  });
});

describe('campaignLine', () => {
  it('the status line first, else the summary’s first sentence', () => {
    expect(campaignLine({ status_line: 'Wren and Tessaly found the purged log.', summary: 'x' })).toBe(
      'Wren and Tessaly found the purged log.',
    );
    expect(campaignLine({ summary: 'The hymn stopped. Then the lights went.' })).toBe('The hymn stopped.');
    expect(campaignLine({ summary: null })).toBe('');
  });
});
