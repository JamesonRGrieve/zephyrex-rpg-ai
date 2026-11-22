// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/structured-cases.json';
import { ItemStream, type PartialItem, freshItems, partialItems, runText, structuredRuns, turnSchema } from './structured';

describe('the structured cases both twins run', () => {
  it('asks for the turn schema', () => {
    expect(turnSchema()).toEqual(cases.schema);
  });
  it.each(cases.partial_cases)('$name', ({ source, items }) => {
    expect(partialItems(source)).toEqual(items);
  });
  it(cases.stream_case.name, () => {
    const stream = new ItemStream(cases.people, cases.seat);
    expect(cases.stream_case.chunks.map((chunk) => stream.feed(chunk))).toEqual(cases.stream_case.events);
    expect([stream.cut, stream.mode]).toEqual([cases.stream_case.cut, cases.stream_case.mode]);
  });
  it(cases.prose_case.name, () => {
    const stream = new ItemStream(cases.people, cases.seat);
    expect(cases.prose_case.chunks.flatMap((chunk) => stream.feed(chunk))).toEqual([]);
    expect(stream.mode).toBe(cases.prose_case.mode);
  });
  it(cases.runs_case.name, () => {
    const whole = cases.partial_cases[1]?.items as PartialItem[];
    const { runs, cut } = structuredRuns(whole, cases.people, cases.seat);
    expect({ runs, cut }).toEqual({ runs: cases.runs_case.runs, cut: cases.runs_case.cut });
    expect(runs.map((run) => runText(run, cases.people))).toEqual(cases.text_cases);
  });
  it(cases.fresh_case.name, () => {
    const whole = cases.partial_cases[1]?.items as PartialItem[];
    expect(freshItems(whole, cases.fresh_case.earlier)).toEqual(cases.fresh_case.kept.map((index) => whole[index]));
  });
});
