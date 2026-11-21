// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/player-lines-cases.json';
import { type PlayerLine, formatPlayerLines, lineSpeaker, parsePlayerLines } from './playerLines';

describe('the structured lines cases both twins run', () => {
  it.each(cases.parse_cases)('$name', ({ text, items }) => {
    expect(parsePlayerLines(text, cases.people)).toEqual(items);
  });
  it('formats what it parses', () => {
    expect(formatPlayerLines(cases.format_case.items as PlayerLine[], cases.people)).toBe(cases.format_case.text);
  });
  it.each(cases.speaker_cases)('the speaker of "$line"', ({ line, speaker }) => {
    expect(lineSpeaker(line, cases.people)).toBe(speaker);
  });
});
