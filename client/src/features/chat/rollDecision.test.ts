// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/roll-decision-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { type TestOptions, isAttempt, lightOutcome, rollPick, rollQuestions } from './rollDecision';

describe('the roll decision cases both twins run', () => {
  it.each(cases.question_cases)('$name', (one) => {
    const attempt = 'attempt' in one ? one.attempt : false;
    expect(rollQuestions(one.options as TestOptions | null, one.mode, one.actor, attempt)).toEqual({
      questions: one.questions,
      picks: one.picks,
    });
  });
  it.each(cases.pick_cases_5e)('$name', ({ answers, pick }) => {
    const options = cases.options_5e as TestOptions;
    const { picks } = rollQuestions(options, 'narrative', 'Fennick');
    expect(rollPick(answers as Record<string, DecideAnswer>, picks, options)).toEqual(pick);
  });
  it.each(cases.attempt_cases)('an attempt: $line', ({ line, attempt }) => {
    expect(isAttempt(line)).toBe(attempt);
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
