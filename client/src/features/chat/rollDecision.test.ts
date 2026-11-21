// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/roll-decision-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { type TestOptions, lightOutcome, rollPick, rollQuestions } from './rollDecision';

describe('the roll decision cases both twins run', () => {
  it.each(cases.question_cases)('$name', ({ options, mode, actor, questions, picks }) => {
    expect(rollQuestions(options as TestOptions | null, mode, actor)).toEqual({ questions, picks });
  });
  it.each(cases.pick_cases)('$name', ({ answers, pack, pick }) => {
    const options = pack ? (cases.options as TestOptions) : null;
    const { picks } = rollQuestions(options, 'narrative', 'Kord');
    expect(rollPick(answers as Record<string, DecideAnswer> | null, picks, options)).toEqual(pick);
  });
  it.each(cases.outcome_cases)('a light roll of $total', ({ total, outcome }) => {
    expect(lightOutcome(total)).toBe(outcome);
  });
});
