// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every action an action line, present tense, against contract/action-cases.json, the cases the server's
 * ActionLines_test holds too (the operator, 2026-11-24: "HOW THE FUCK ARE WE STILL NOT TAGGING ACTIONS?"), in
 * both multi-actor modes.
 */
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/action-cases.json';
import { type ActionRun, actedParts, actionLines, present } from './actionLines';

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

describe("the parts a lite narration is saved as (the server's credited_runs)", () => {
  const people = cases.people;

  it("makes a person's action in the narration their action line, and keeps the world narration", () => {
    const saved = actedParts([{ speaker_id: null, text: 'Old Hesk shifts his weight. The ferry bumps the post.' }], people);
    expect(saved).toEqual([
      { speaker_id: 'hesk', text: 'Old Hesk shifts his weight.' },
      { speaker_id: null, text: 'The ferry bumps the post.' },
    ]);
  });

  it('reads "she" after a speaker\'s line as them, and keeps their own line as written', () => {
    const line = { speaker_id: 'del', text: 'Delphine Halloway (to Brenna): "Not how he does business."' };
    const saved = actedParts([line, { speaker_id: null, text: 'She rose from her seat. Rain drums on the roof.' }], people);
    expect(saved).toEqual([
      line,
      { speaker_id: 'del', text: 'Delphine Halloway rises from her seat.' },
      { speaker_id: null, text: 'Rain drums on the roof.' },
    ]);
  });

  it('cuts the action with multi-actor turns off, never saving it as narration', () => {
    const saved = actedParts(
      [{ speaker_id: null, text: 'Old Hesk shifts his weight. The ferry bumps the post.' }],
      people,
      true,
    );
    expect(saved).toEqual([{ speaker_id: null, text: 'The ferry bumps the post.' }]);
  });

  it('keeps a part spoken by someone not yet a person, and a narration naming no one, as they are', () => {
    const parts = [
      { speaker_id: null, speaker_name: 'Barkeep', text: '"Rooms upstairs."' },
      { speaker_id: null, text: 'Rain drums on the roof.' },
    ];
    expect(actedParts(parts, people)).toEqual(parts);
  });
});
