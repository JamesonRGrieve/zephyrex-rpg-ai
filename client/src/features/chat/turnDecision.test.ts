// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/turn-decision-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import {
  type Presence,
  type TurnPick,
  type TurnSeat,
  presentCast,
  turnPick,
  turnQuestion,
  turnSeat,
  turnState,
} from './turnDecision';

describe('the turn decision cases both twins run', () => {
  it.each(cases.seat_cases)('$name', ({ chat_seat: chatSeat, playing, seat }) => {
    expect(turnSeat(chatSeat, playing)).toBe(seat);
  });
  it.each(cases.question_cases)('$name', (one) => {
    const { cast, muted, seated, seat, player, question, picks } = one;
    const reachable = 'reachable' in one ? one.reachable : null;
    const afterPerson = 'after_person' in one ? one.after_person : false;
    expect(turnQuestion(cast, muted, seated, seat as TurnSeat, player, reachable, afterPerson)).toEqual({
      question,
      picks,
    });
  });
  it.each(cases.presence_cases)('$name', ({ cast, presence, present, vox }) => {
    expect(presentCast(cast, presence as unknown as Presence)).toEqual({ present, vox });
  });
  it.each(cases.pick_cases)('$name', ({ answer, pick }) => {
    expect(turnPick(answer as DecideAnswer | null, cases.pick_picks as Record<string, TurnPick>)).toEqual(pick);
  });
  it('reads the recent story', () => {
    expect(turnState(cases.state_case.lines)).toBe(cases.state_case.state);
    expect(turnState(cases.scene_state_case.lines, cases.scene_state_case.scene)).toBe(cases.scene_state_case.state);
    expect(turnState(cases.empty_scene_state_case.lines, cases.empty_scene_state_case.scene)).toBe(
      cases.empty_scene_state_case.state,
    );
  });
});
