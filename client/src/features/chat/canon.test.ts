// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/canon-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { canonQuestions, canonState, canonVerdict } from './canon';

describe('canonVerdict (contract/canon-cases.json)', () => {
  for (const one of cases.cases) {
    it(one.name, () => {
      expect(canonVerdict(one.answers as Record<string, DecideAnswer | null>, one.facts)).toEqual(one.verdict);
    });
  }
});

describe('canonQuestions', () => {
  it('offers each fact once, and none of them', () => {
    const facts = [
      { title: 'Osric', text: 'Dead.' },
      { title: 'Osric', text: 'Again.' },
      { title: 'Terra', text: 'Throneworld.' },
    ];
    const questions = canonQuestions(facts);
    expect(questions.fact).toMatchObject({ type: 'choice', criteria: ['Osric', 'Terra', cases.none_option] });
    expect(canonState('Magnus', 'Who is this Omnissiah?', facts)).toMatch(
      /The line to check:\nMagnus: Who is this Omnissiah\?$/,
    );
  });
});
