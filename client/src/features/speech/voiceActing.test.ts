// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { voiceParts } from './voiceActing';

const CAST = ['Mira', 'Old Tom'];

describe('voiceParts', () => {
  it('reads a character’s own reply with their quotes in their voice and the rest as the narrator', () => {
    expect(voiceParts('*She leans in.* "Not here," she whispers. "Mira is watching."', CAST, 'Ada')).toEqual([
      { speaker: null, text: '*She leans in.*' },
      { speaker: 'Ada', text: 'Not here,' },
      { speaker: null, text: 'she whispers.' },
      { speaker: 'Ada', text: 'Mira is watching.' },
    ]);
  });

  it('reads narration as the narrator and each quote as the NPC named beside it', () => {
    expect(voiceParts('The door creaks. Mira says, "Who goes there?" Old Tom laughs. "Only me."', CAST)).toEqual([
      { speaker: null, text: 'The door creaks. Mira says,' },
      { speaker: 'Mira', text: 'Who goes there?' },
      { speaker: null, text: 'Old Tom laughs.' },
      { speaker: 'Old Tom', text: 'Only me.' },
    ]);
  });

  it('takes a speaker named after the quote, and a colon before it', () => {
    expect(voiceParts('“Stay back,” says Mira.', CAST)).toEqual([
      { speaker: 'Mira', text: 'Stay back,' },
      { speaker: null, text: 'says Mira.' },
    ]);
    expect(voiceParts('Old Tom: "Ale\'s off."', CAST)[1]).toEqual({ speaker: 'Old Tom', text: "Ale's off." });
  });

  it('continues the last speaker for an unnamed quote, but not across a paragraph', () => {
    const parts = voiceParts('Mira frowns. "No." She turns. "Never."\n\n"Who said that?"', CAST);
    expect(parts.filter((part) => part.speaker !== null)).toEqual([
      { speaker: 'Mira', text: 'No.' },
      { speaker: 'Mira', text: 'Never.' },
    ]);
    expect(parts.at(-1)).toEqual({ speaker: null, text: 'Who said that?' });
  });

  it('matches whole names only, in any case, and gives a line with no quotes to the narrator', () => {
    // "Admiral" isn't "Mira", and no one in the cast is named, so the narrator reads it all.
    expect(voiceParts('Admiral says, "Hold."', ['Mira'])).toEqual([{ speaker: null, text: 'Admiral says, Hold.' }]);
    expect(voiceParts('MIRA shouts, "Down!"', CAST)[1]).toEqual({ speaker: 'Mira', text: 'Down!' });
    expect(voiceParts('Rain falls on the town.', CAST)).toEqual([{ speaker: null, text: 'Rain falls on the town.' }]);
  });
});
