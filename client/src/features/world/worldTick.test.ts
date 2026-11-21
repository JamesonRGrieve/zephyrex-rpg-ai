// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/world-tick-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import {
  type TickLocation,
  type TickPerson,
  arrivals,
  lastSeenAfter,
  lastSeenLines,
  routineSlot,
  tickMoves,
  tickOptions,
  tickQuestions,
  tickState,
} from './worldTick';

const persons = cases.persons as TickPerson[];
const locations = cases.locations as TickLocation[];
const vardane = persons[0] as TickPerson;

describe('the world tick cases both twins run', () => {
  it.each(cases.slot_cases)('$name', (one) => {
    const routine = 'routine' in one ? null : vardane.routine;
    expect(routineSlot(routine, one.clock)?.location_id ?? null).toBe(one.location_id);
  });
  it('offers only real places, staying first', () => {
    expect(tickOptions(vardane, locations, cases.clock)).toEqual(cases.options_case.options);
  });
  it('asks once per NPC that may move', () => {
    expect(tickQuestions(persons, locations, cases.clock, cases.questions_case.still)).toEqual({
      questions: cases.questions_case.questions,
      picks: cases.questions_case.picks,
      fallbacks: cases.questions_case.fallbacks,
    });
  });
  it.each(cases.move_cases)('$name', ({ answers, moves }) => {
    const { picks, fallbacks } = tickQuestions(persons, locations, cases.clock, cases.questions_case.still);
    expect(tickMoves(answers as Record<string, DecideAnswer> | null, picks, fallbacks, persons)).toEqual(moves);
  });
  it.each(cases.arrival_cases)('$name', ({ moves, scene, arrivals: arrived }) => {
    expect(arrivals(moves, scene, locations)).toEqual(arrived);
  });
  it.each(cases.state_cases)('the state at $place', ({ place, state }) => {
    expect(tickState(cases.clock, place)).toBe(state);
  });
  it('keeps what the party last saw', () => {
    const seen = cases.last_seen_case;
    expect(lastSeenAfter(seen.before, seen.present, seen.location_of, cases.clock)).toEqual(seen.after);
    expect(lastSeenLines(seen.after, persons, seen.present, locations)).toEqual(seen.lines);
  });
});
