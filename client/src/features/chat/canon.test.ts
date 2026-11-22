// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/canon-cases.json';
import type { DecideAnswer } from '~/features/decide/decide';
import { type CanonVerdict, canonNotice, canonQuestions, canonState, canonVerdict, readWhy, whyMessages } from './canon';

describe('canonVerdict (contract/canon-cases.json)', () => {
  for (const one of cases.cases) {
    it(one.name, () => {
      expect(canonVerdict(one.answers as Record<string, DecideAnswer | null>, one.facts, one.line)).toEqual(one.verdict);
    });
  }
});

describe('readWhy and canonNotice (the operator, 2026-11-22: "I need WHY!")', () => {
  for (const one of cases.why_cases) it(one.name, () => expect(readWhy(one.answer)).toBe(one.why));
  for (const one of cases.notice_cases)
    it(one.name, () => expect(canonNotice(one.verdict as CanonVerdict, one.why)).toEqual(one.notice));
  it('asks against the fact, or the setting', () => {
    expect(whyMessages('Mags', 'Hi.', 'Mags: Mags keeps the Lantern.')[0]?.content).toContain(
      'The canon: Mags: Mags keeps the Lantern.',
    );
    expect(whyMessages('Mags', 'Hi.', null)[0]?.content).toContain(cases.why_setting);
  });
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
