// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/prompt-cases.json';
import { assemblePrompt, estimateTokens, type PromptCharacter, type PromptInput, splitReasoning, summaryPrompt } from './assemble';

type CaseInput = Omit<PromptInput, 'characters'> & { characters: (keyof typeof cases.characters)[] };

const CHARACTERS: Record<string, PromptCharacter> = cases.characters;

describe('assemblePrompt (contract/prompt-cases.json)', () => {
  it.each(cases.cases)('$name', ({ input, messages, dropped }) => {
    const given = input as unknown as CaseInput;
    const result = assemblePrompt({ ...given, characters: given.characters.map((key) => CHARACTERS[key]) });
    expect(result.messages).toEqual(messages);
    expect(result.dropped).toBe(dropped);
  });

  it('refuses a speaker who is not in the chat', () => {
    expect(() =>
      assemblePrompt({
        characters: [CHARACTERS.ada],
        speaker_id: 'someone-else',
        persona: null,
        author_note: '',
        history: [],
        context_tokens: 8192,
        max_tokens: 400,
      }),
    ).toThrow('The speaker must be one of the chat’s characters');
  });

  it('estimates tokens from length, plus the per-message overhead', () => {
    expect(estimateTokens({ role: 'user', content: 'abcdefgh' })).toBe(6);
    expect(estimateTokens({ role: 'user', content: '' })).toBe(4);
  });
});

describe('summaryPrompt (contract/prompt-cases.json summary_cases)', () => {
  it.each(cases.summary_cases)('$name', ({ input, messages, dropped }) => {
    const given = input as unknown as CaseInput;
    const result = summaryPrompt({ ...given, characters: given.characters.map((key) => CHARACTERS[key] as PromptCharacter) });
    expect(result.messages).toEqual(messages);
    expect(result.dropped).toBe(dropped);
  });
});

describe('splitReasoning (contract/prompt-cases.json reasoning_cases)', () => {
  it.each(cases.reasoning_cases)('$name', ({ text, reasoning, reply }) => {
    expect(splitReasoning(text)).toEqual({ reasoning, reply });
  });
});
