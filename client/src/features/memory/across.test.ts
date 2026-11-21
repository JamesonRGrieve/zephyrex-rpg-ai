// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/memory-across-cases.json';
import { acrossText, recallAcross, remembersAcrossChats, withAcrossChats } from './across';

describe('the memory-across-chats cases both twins run (AP8)', () => {
  it.each(cases.flag_cases)('$name', ({ extensions, on }) => {
    expect(remembersAcrossChats(extensions)).toBe(on);
  });
  it.each(cases.with_cases)('$name', ({ extensions, on, result }) => {
    expect(withAcrossChats(extensions, on)).toEqual(result);
  });
  it.each(cases.recall_cases)('$name', ({ query, here, elsewhere, recalled, text }) => {
    const found = recallAcross(query, here, elsewhere, 'Ada');
    expect(found).toEqual(recalled);
    expect(acrossText(found, 'Ada')).toBe(text);
  });
});
