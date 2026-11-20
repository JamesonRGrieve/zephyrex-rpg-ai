// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { hasNote, proposedNote } from './proposedNote';

describe('proposedNote', () => {
  it('reads the note on the last line, and gives the answer without it', () => {
    expect(proposedNote('Sure, we can skip travel.\nNote (pacing): Skip travel between ports.\n')).toEqual({
      note: { kind: 'pacing', text: 'Skip travel between ports.' },
      rest: 'Sure, we can skip travel.',
    });
    expect(proposedNote('Done.\nnote (HOUSE_RULE): Crits explode.')?.note).toEqual({
      kind: 'house_rule',
      text: 'Crits explode.',
    });
  });

  it('proposes nothing from a plain answer, an unknown kind, an empty note, or a note mid-answer', () => {
    expect(proposedNote('Roll when you try.')).toBeNull();
    expect(proposedNote('Ok.\nNote (law): No running.')).toBeNull();
    expect(proposedNote('Ok.\nNote (tone): ')).toBeNull();
    expect(proposedNote('Note (tone): Grim.\nBut first, roll.')).toBeNull();
  });

  it('knows a note the table already keeps', () => {
    expect(hasNote([{ kind: 'tone', text: 'Grim and hopeful.' }], { kind: 'tone', text: 'grim and hopeful.' })).toBe(true);
    expect(hasNote([{ kind: 'tone', text: 'Grim.' }], { kind: 'pacing', text: 'Grim.' })).toBe(false);
  });
});
