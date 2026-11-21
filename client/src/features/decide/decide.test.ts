// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/decide-cases.json';
import { batchQuestions, decideMessage, decideRequest, type DecideQuestion, readAnswers } from './decide';

type Questions = Record<string, DecideQuestion>;

describe('the decide protocol, held to contract/decide-cases.json', () => {
  it.each(cases.build)('builds the message: $name', (one) => {
    expect(decideMessage(one.state, one.questions as unknown as Questions)).toEqual(one.message);
  });

  it.each(cases.parse)('reads the answers: $name', (one) => {
    expect(readAnswers(one.questions as unknown as Questions, one.content)).toEqual(one.answers);
  });

  it.each(cases.batch)('batches within the budget: $name', (one) => {
    expect(batchQuestions(one.state_characters, one.question_characters, one.budget)).toEqual(one.batches);
  });

  it('asks for a JSON object, not a stream, with the message as the last user turn', () => {
    const body = decideRequest('3-5gb/d1-2b', 'A tea party.', { a: { type: 'noul', instructions: 'Rain?' } });
    expect(body).toMatchObject({ model: '3-5gb/d1-2b', response_format: { type: 'json_object' }, stream: false });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.at(-1)?.role).toBe('user');
    expect(JSON.parse(messages.at(-1)?.content ?? '')).toEqual({
      state: 'A tea party.',
      questions: { a: { type: 'noul', instructions: 'Rain?' } },
    });
  });
});
