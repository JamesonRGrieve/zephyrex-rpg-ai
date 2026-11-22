// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { thinkSplitter, thinkingFields, thinkingMode, type ThinkPiece } from './thinking';

function split(pieces: string[]): ThinkPiece[] {
  const splitter = thinkSplitter();
  const out = [...pieces.flatMap((piece) => splitter.take(piece)), ...splitter.end()];
  return out.reduce<ThinkPiece[]>((merged, [kind, text]) => {
    const last = merged.at(-1);
    if (last !== undefined && last[0] === kind) last[1] += text;
    else merged.push([kind, text]);
    return merged;
  }, []);
}

describe('thinking (the operator, 2026-11-22: thinking shown folded under the narrator)', () => {
  it('splits thinking from the answer even with tags cut across pieces', () => {
    expect(split(['<th', 'ink>The owl', 'bear is hu', 'ngry.</thi', 'nk>The beast', ' roars.'])).toEqual([
      ['think', '<think>The owlbear is hungry.</think>'],
      ['answer', 'The beast roars.'],
    ]);
  });
  it('keeps an answer without thinking whole, a lone < included', () => {
    expect(split(['Ada says 3 <', ' 4.'])).toEqual([['answer', 'Ada says 3 < 4.']]);
  });
  it('closes a block left open at the end', () => {
    expect(split(['<think>still going'])).toEqual([['think', '<think>still going</think>']]);
  });
  it('counts only thinking against the budget', () => {
    const splitter = thinkSplitter();
    splitter.take('A long answer. '.repeat(1000));
    expect(splitter.overBudget()).toBe(false);
    splitter.take(`<think>${'hmm '.repeat(2000)}`);
    expect(splitter.overBudget()).toBe(true);
  });
  it('thinks only where the traits say a model can', () => {
    expect(thinkingMode({})).toBeNull();
    expect(thinkingMode({ reasoning_effort: 'none' })).toBe('on');
    expect(thinkingMode({ reasoning_effort: 'none', thinking: false })).toBe('off');
    expect(thinkingFields('on', 'none')).toEqual({
      chat_template_kwargs: { enable_thinking: true },
      reasoning_effort: 'low',
    });
    expect(thinkingFields('off', 'none')).toEqual({
      chat_template_kwargs: { enable_thinking: false },
      think: false,
      reasoning_effort: 'none',
    });
    expect(thinkingFields(null, null)).toEqual({});
  });
});
