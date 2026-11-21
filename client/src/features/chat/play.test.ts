// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/play-cases.json';
import { aiCast, playedPersona, sessionStartIndex, sessionsSummary } from './play';

describe('sessions (contract/play-cases.json)', () => {
  for (const one of cases.cases) {
    it(one.name, () => {
      const path = one.path.map((id) => ({ id }));
      expect(sessionStartIndex(path, one.sessions)).toBe(one.start);
      expect(sessionsSummary(path, one.sessions)).toBe(one.summary);
    });
  }
});

describe('the seat (contract/play-cases.json)', () => {
  for (const one of cases.seat_cases) {
    it(one.name, () => {
      expect(aiCast(one.party, one.playing?.id ?? null)).toEqual(one.ai_cast);
      expect(playedPersona(one.playing, one.persona)).toEqual(one.who);
    });
  }
});
