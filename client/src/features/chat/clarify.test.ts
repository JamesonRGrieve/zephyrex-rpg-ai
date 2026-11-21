// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/clarify-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { clarifyNeed, clarifyQuestions, shouldAsk } from './clarify';
import type { PlayerLine } from './playerLines';

describe('the clarify cases both twins run', () => {
  it.each(cases.need_cases)('$name', ({ items, seat, candidates, need }) => {
    expect(clarifyNeed(items as PlayerLine[], seat, candidates)).toEqual(need);
  });
  it('asks only among the candidates', () => {
    const { action, actor, candidates, questions } = cases.questions_case;
    expect(clarifyQuestions(action, actor, candidates)).toEqual(questions);
  });
  it.each(cases.ask_cases)('asks for $answer', ({ answer, ask }) => {
    expect(shouldAsk(answer as DecideAnswer | null)).toBe(ask);
  });
});
