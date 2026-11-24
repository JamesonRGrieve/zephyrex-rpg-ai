// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { byPerson, gmLine } from './generate';

describe('the person’s own lines (Zephyrex RPG’s build37 run: no roll ever)', () => {
  it('counts a user line, and in a campaign their seat’s character lines', () => {
    expect(byPerson({ role: 'user', speaker_character_id: null }, null)).toBe(true);
    expect(byPerson({ role: 'character', speaker_character_id: 'fennick' }, 'fennick')).toBe(true);
    expect(byPerson({ role: 'character', speaker_character_id: 'maelis' }, 'fennick')).toBe(false);
    expect(byPerson({ role: 'narrator', speaker_character_id: null }, 'fennick')).toBe(false);
  });
});

describe('the GM seat’s own narration (Zephyrex RPG’s build57 run, chat 99a9f3c0: Hesk given six turns)', () => {
  it('is a narrator line the person wrote, never a model’s, and only in the GM’s seat', () => {
    expect(gmLine({ role: 'narrator' }, true)).toBe(true);
    expect(gmLine({ role: 'narrator', generated: false }, true)).toBe(true);
    expect(gmLine({ role: 'narrator', generated: true }, true)).toBe(false);
    expect(gmLine({ role: 'character' }, true)).toBe(false);
    expect(gmLine({ role: 'narrator' }, false)).toBe(false);
  });
});
