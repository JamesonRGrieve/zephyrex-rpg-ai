// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every action an action line, present tense, against contract/action-cases.json, the cases the server's
 * ActionLines_test holds too (the operator, 2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING ACTIONS?"), in
 * both multi-actor modes.
 */
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/action-cases.json';
import { type ActionRun, actionLines, present } from './actionLines';

const shape = (runs: readonly ActionRun[]): unknown[] =>
  runs.map((run) => [run.speaker_id, run.lines.map((line) => line.kind), run.lines.map((line) => line.text)]);

describe('action lines (contract/action-cases.json)', () => {
  it('puts a past verb in the present', () => {
    const tenses: Record<string, string> = cases.tenses;
    expect(Object.fromEntries(Object.keys(tenses).map((verb) => [verb, present(verb)]))).toEqual(tenses);
  });

  it.each(cases.cases.map((one) => [one.name, one] as const))('%s', (_name, one) => {
    const { runs, wrong } = actionLines(one.runs as unknown as ActionRun[], cases.people);
    expect(shape(runs)).toEqual(one.runs_out);
    expect(wrong).toEqual(one.wrong);
    // Multi-actor off: a narration keeps only the narrator's own lines (the action is cut, never narration).
    expect(shape(runs.filter((run) => run.speaker_id === null))).toEqual(one.solo);
  });
});
