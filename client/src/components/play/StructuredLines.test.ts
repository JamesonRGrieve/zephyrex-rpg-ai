// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionApart, readLines } from './StructuredLines';

describe('readLines', () => {
  it('an action that carries speech is the action, then a bubble', () => {
    expect(
      readLines('Brakka Ironmantle snorts, wiping foam from her beard. "Aye, I reckon most everyone has." She grins.', [
        'Brakka Ironmantle',
      ]),
    ).toEqual([
      { kind: 'do', speaker: 'Brakka Ironmantle', target: null, text: 'snorts, wiping foam from her beard.' },
      { kind: 'say', speaker: 'Brakka Ironmantle', target: null, manner: 'speak', text: 'Aye, I reckon most everyone has.' },
      { kind: 'do', speaker: 'Brakka Ironmantle', target: null, text: 'She grins.' },
    ]);
  });
  it('speech from someone the cast list does not know is still a bubble', () => {
    expect(readLines('The Barkeep (to Fennick): "Keep it out of the hearth."', ['Fennick'])).toEqual([
      { kind: 'say', speaker: 'The Barkeep', target: 'Fennick', manner: 'speak', text: 'Keep it out of the hearth.' },
    ]);
  });
  it('words, then what the speaker does after them on the same line', () => {
    expect(
      readLines('Sister Maelis Varn (to no one in particular): "The dignity of a house…" She shakes her head.', [
        'Sister Maelis Varn',
      ]),
    ).toEqual([
      {
        kind: 'say',
        speaker: 'Sister Maelis Varn',
        target: 'no one in particular',
        manner: 'speak',
        text: 'The dignity of a house…',
      },
      { kind: 'do', speaker: 'Sister Maelis Varn', target: null, text: 'She shakes her head.' },
    ]);
  });
  it('an action keeps what the actor does; the scene after it is narration', () => {
    expect(
      actionApart({
        kind: 'do',
        speaker: 'Mags Thornbury',
        target: null,
        text: 'blinks slowly. Around the room, fights are pausing mid-swing as people process this question.',
      }),
    ).toEqual([
      { kind: 'do', speaker: 'Mags Thornbury', target: null, text: 'blinks slowly.' },
      { kind: 'narrate', text: 'Around the room, fights are pausing mid-swing as people process this question.' },
    ]);
    expect(
      actionApart({ kind: 'do', speaker: 'Mags', target: null, text: 'wipes the bar. She sighs. Mags looks up.' }),
    ).toHaveLength(1);
  });
});
