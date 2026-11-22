// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/line-labels-cases.json';
import { labelQuestions, messageLines, readLabels } from './lineLabels';

describe('the line label cases both twins run', () => {
  it.each(cases.split_cases)('$name', ({ text, lines }) => {
    expect(messageLines(text)).toEqual(lines);
  });
  it(cases.question_case.name, () => {
    const { state, questions } = labelQuestions(cases.question_case.lines, cases.question_case.previous, cases.people);
    expect(Object.keys(questions)).toEqual(cases.question_case.keys);
    expect(state).toBe(cases.question_case.state);
  });
  it.each(cases.read_cases)('$name', ({ lines, answers, labels }) => {
    expect(readLabels(lines, answers, cases.people)).toEqual(labels);
  });
});
