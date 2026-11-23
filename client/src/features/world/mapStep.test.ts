// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/map-step-cases.json';
import type { PlayerLine } from '~/features/chat/playerLines';
import { mapQuestions, movers, sceneChanges, sceneQuestions, seatPlace } from './mapStep';

describe('the map step cases both twins run', () => {
  it('finds who moved: do lines with a movement word, never speech or narration', () => {
    expect(movers(cases.items as PlayerLine[])).toEqual(cases.movers);
    expect(movers(cases.no_movement_items as PlayerLine[])).toEqual([]);
  });
  it('asks each mover among real places, staying the fallback', () => {
    expect(mapQuestions(cases.movers, cases.persons, cases.locations)).toEqual({
      questions: cases.questions,
      picks: cases.picks,
      fallbacks: cases.fallbacks,
    });
  });
});

describe('where the seat is: the banner, server truth', () => {
  it.each(cases.seat_cases)('$name', ({ seat, moves, place }) => {
    expect(seatPlace(seat, cases.persons, cases.locations, moves)).toEqual(place);
  });
});

describe('scene moves (the operator, 2026-11-23: "the DM correctly moves people on the map")', () => {
  it.each(cases.scene_cases)('$name', ({ text, on_scene, seat, questions, answers, changes }) => {
    const asked = sceneQuestions(text, cases.scene_people, on_scene, seat);
    expect(Object.keys(asked)).toEqual(questions);
    expect(sceneChanges(answers, asked)).toEqual(changes);
  });
});
