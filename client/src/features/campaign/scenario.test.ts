// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  learned,
  ScenarioFileError,
  scenarioFromJson,
  scenarioToJson,
  toggleBeat,
  toggleClue,
} from './scenario';

const CLOCKS = [{ name: 'Pump', segments: 4, filled: 3, advances: '', when_full: '' }];
const SECRETS = [
  {
    truth: 'Reyes did it.',
    clues: [
      { text: 'Cut marks', found: false },
      { text: 'Gloves', found: false },
    ],
  },
];

describe('scenario state in play', () => {
  it('moves a clock within its segments', () => {
    expect(advanceClock(CLOCKS, 0, 1)[0]?.filled).toBe(4);
    expect(advanceClock(CLOCKS, 0, 5)[0]?.filled).toBe(4);
    expect(advanceClock(CLOCKS, 0, -9)[0]?.filled).toBe(0);
  });

  it('finds a clue (the secret is then learned) and marks a beat', () => {
    const found = toggleClue(SECRETS, 0, 1);
    expect(found[0]?.clues.map((clue) => clue.found)).toEqual([false, true]);
    expect(learned(found[0] as (typeof SECRETS)[number])).toBe(true);
    expect(toggleBeat([{ text: 'Buyer hails', done: false }], 0)).toEqual([{ text: 'Buyer hails', done: true }]);
  });
});

describe('scenario files', () => {
  it('writes the parts with play reset, and reads them back with defaults filled', () => {
    const parts = {
      name: 'Sabotage',
      campaign_id: 'c1',
      premise: 'Someone cuts the line.',
      hook: '',
      stakes: '',
      situation: '',
      cast: [],
      places: ['Engine room'],
      clocks: CLOCKS,
      secrets: toggleClue(SECRETS, 0, 0),
      beats: [{ text: 'Buyer hails', done: true }],
      outcomes: [],
    };
    const file = scenarioToJson(parts);
    expect(JSON.stringify(file)).not.toContain('c1');
    const back = scenarioFromJson(JSON.parse(JSON.stringify(file)));
    expect(back.clocks[0]?.filled).toBe(0);
    expect(back.secrets[0]?.clues.every((clue) => !clue.found)).toBe(true);
    expect(back.beats[0]?.done).toBe(false);
    expect(scenarioFromJson({ name: 'Bare' })).toMatchObject({ name: 'Bare', cast: [], clocks: [] });
    expect(() => scenarioFromJson({ premise: 'no name' })).toThrow(ScenarioFileError);
  });
});
