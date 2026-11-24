// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { failed, optionScores, readDecisionCall } from './DecisionCalls';

const question = { key: 'next', type: 'choice', instructions: 'Who speaks next?', options: ['Hesk', 'Delphine', 'nobody'] };

describe('optionScores', () => {
  it('lists every option offered, each with its own score, best first, the chosen one marked', () => {
    const scored = optionScores(question, { choice: 'Delphine', scores: { Hesk: 0.2, Delphine: 0.7, nobody: 0.1 } });
    expect(scored.map((one) => [one.option, one.score, one.chosen])).toEqual([
      ['Delphine', 0.7, true],
      ['Hesk', 0.2, false],
      ['nobody', 0.1, false],
    ]);
  });

  it('keeps the options the server scored as a list', () => {
    const scored = optionScores(question, { choice: 'Hesk', options: [{ option: 'Hesk', score: 0.9 }, { option: 'nobody', score: 0.1 }] });
    expect(scored[0]).toEqual({ option: 'Hesk', score: 0.9, chosen: true });
    expect(scored.find((one) => one.option === 'Delphine')?.score).toBeNull();
  });

  it('shows the chosen probability when that is all the server kept', () => {
    const scored = optionScores(question, { choice: 'nobody', probability: 0.8 });
    expect(scored[0]).toEqual({ option: 'nobody', score: 0.8, chosen: true });
    expect(scored).toHaveLength(3);
  });
});

describe('readDecisionCall', () => {
  it('reads the server status, the try and the offered options', () => {
    const call = readDecisionCall({
      id: 'd1',
      purpose: 'next_turn',
      status: 'running',
      attempt: 2,
      questions: [{ key: 'next', type: 'choice', instructions: 'Who?', options: ['A', { value: 'B' }] }],
      answers: null,
      created_at: '2026-11-24T04:00:00',
    });
    expect(call?.state).toBe('running');
    expect(call?.attempt).toBe(2);
    expect(call?.questions[0]?.options).toEqual(['A', 'B']);
    expect(call !== null && failed(call)).toBe(false);
  });
});

describe('the criteria offered as {option: meaning}', () => {
  it('reads their names as the options', () => {
    const call = readDecisionCall({
      id: 'd2',
      purpose: 'format_check',
      questions: [{ key: 'actions', type: 'choice', instructions: 'Actions in action lines?', options: { met: 'yes', 'not met': 'no' } }],
      answers: { actions: { choice: 'met', probability: 0.9, scores: { met: 0.9, 'not met': 0.1 } } },
      created_at: '2026-11-24T05:00:00',
    });
    expect(call?.questions[0]?.options).toEqual(['met', 'not met']);
  });
});
