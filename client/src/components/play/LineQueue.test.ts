// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatLines } from './LineQueue';

const names = new Map([
  ['tess', 'Tessaly Kord'],
  ['wren', 'Wren Saltash'],
  ['ruhl', 'Confessor Ruhl'],
]);

describe('formatLines', () => {
  it('one line per queued item: speech to someone, an action after the name, the narrator', () => {
    expect(
      formatLines(
        [
          { kind: 'say', speakerId: 'tess', targetId: 'wren', text: 'Quiet. Listen.' },
          { kind: 'do', speakerId: 'tess', text: 'bangs on the wall with her mechadendrite.' },
          { kind: 'say', speakerId: 'ruhl', targetId: null, text: 'Kneel.' },
          { kind: 'do', speakerId: null, text: 'The lights flicker.' },
        ],
        names,
      ),
    ).toBe(
      [
        'Tessaly Kord (to Wren Saltash): "Quiet. Listen."',
        'Tessaly Kord bangs on the wall with her mechadendrite.',
        'Confessor Ruhl (to everyone): "Kneel."',
        'Narrator: The lights flicker.',
      ].join('\n'),
    );
  });
  it('empty items are left out; stray quotes and asterisks are trimmed', () => {
    expect(
      formatLines(
        [
          { kind: 'say', speakerId: 'tess', targetId: null, text: '"Hello?"' },
          { kind: 'do', speakerId: 'tess', text: '*stomps*' },
          { kind: 'say', speakerId: 'tess', targetId: null, text: '  ' },
        ],
        names,
      ),
    ).toBe(['Tessaly Kord (to everyone): "Hello?"', 'Tessaly Kord stomps'].join('\n'));
  });
  it('says how: whispers, shouts, vox to someone, a voxcast to all', () => {
    expect(
      formatLines(
        [
          { kind: 'say', speakerId: 'tess', targetId: 'wren', manner: 'whisper', text: 'Now.' },
          { kind: 'say', speakerId: 'tess', targetId: null, manner: 'shout', text: 'Down!' },
          { kind: 'say', speakerId: 'tess', targetId: 'ruhl', manner: 'vox', text: 'Status?' },
          { kind: 'say', speakerId: 'ruhl', targetId: null, manner: 'voxcast', text: 'All decks, brace.' },
        ],
        names,
      ),
    ).toBe(
      [
        'Tessaly Kord (to Wren Saltash, whispers): "Now."',
        'Tessaly Kord (to everyone, shouts): "Down!"',
        'Tessaly Kord (vox to Confessor Ruhl): "Status?"',
        'Confessor Ruhl (voxcast): "All decks, brace."',
      ].join('\n'),
    );
  });
});
