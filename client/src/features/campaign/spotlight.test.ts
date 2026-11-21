// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/spotlight-cases.json';
import { quietPlayers, spotlightNote, type TableLine } from './spotlight';

interface Repeat {
  speaker: string;
  channel: string;
  count: number;
}

const linesOf = (testCase: { lines?: TableLine[]; lines_repeat?: { first: Repeat; then: Repeat } }): TableLine[] =>
  testCase.lines ??
  [testCase.lines_repeat?.first, testCase.lines_repeat?.then].flatMap((run) =>
    run === undefined ? [] : Array.from({ length: run.count }, () => ({ speaker: run.speaker, channel: run.channel })),
  );

describe('spotlight (contract/spotlight-cases.json, shared with the server)', () => {
  it.each(cases.cases)('$name', (testCase) => {
    const quiet = quietPlayers(testCase.pcs, linesOf(testCase));
    expect(quiet).toEqual(testCase.quiet);
    expect(spotlightNote(quiet)).toBe(testCase.note);
  });
});
