// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/turn-decision-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { type TurnPick, type TurnSeat, turnPick, turnQuestion, turnSeat, turnState } from './turnDecision';

describe('the turn decision cases both twins run', () => {
  it.each(cases.seat_cases)('$name', ({ chat_seat: chatSeat, playing, seat }) => {
    expect(turnSeat(chatSeat, playing)).toBe(seat);
  });
  it.each(cases.question_cases)('$name', ({ cast, muted, seated, seat, player, question, picks }) => {
    expect(turnQuestion(cast, muted, seated, seat as TurnSeat, player)).toEqual({ question, picks });
  });
  it.each(cases.pick_cases)('$name', ({ answer, pick }) => {
    expect(turnPick(answer as DecideAnswer | null, cases.pick_picks as Record<string, TurnPick>)).toEqual(pick);
  });
  it('reads the recent story', () => {
    expect(turnState(cases.state_case.lines)).toBe(cases.state_case.state);
  });
});
