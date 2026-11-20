// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { finishedText } from './useDictation';

const result = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal });

describe('finishedText', () => {
  it('joins the finished phrases from the new result on, leaving out the unfinished', () => {
    expect(finishedText([result('old', true), result(' I wave ', true), result('and', false)], 1)).toBe('I wave');
    expect(finishedText([], 0)).toBe('');
  });
});
