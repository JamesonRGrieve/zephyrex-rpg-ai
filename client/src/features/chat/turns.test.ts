// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { greetingSwipes, nextSpeaker, siblingsOf } from './turns';

const said = (id: string, speaker: string | null, role = 'character', channel = 'ic') => ({
  id,
  parent_id: null,
  role,
  channel,
  speaker_character_id: speaker,
});

describe('turns', () => {
  it('lets the one character reply, and takes turns in a group', () => {
    expect(nextSpeaker(['a'], [])).toBe('a');
    expect(nextSpeaker(['a', 'b', 'c'], [])).toBe('a');
    expect(nextSpeaker(['a', 'b', 'c'], [said('1', 'a'), said('2', null, 'user')])).toBe('b');
    expect(nextSpeaker(['a', 'b', 'c'], [said('1', 'c')])).toBe('a');
    expect(nextSpeaker([], [])).toBeNull();
  });

  it('skips muted members in a group, and has no one when all are muted', () => {
    const spoke = [{ id: 'm1', parent_id: null, role: 'character', channel: 'ic', speaker_character_id: 'a' }];
    expect(nextSpeaker(['a', 'b', 'c'], spoke, ['b'])).toBe('c');
    expect(nextSpeaker(['a', 'b'], spoke, ['a', 'b'])).toBeNull();
  });

  it('ignores out-of-character lines when finding who spoke last', () => {
    expect(nextSpeaker(['a', 'b'], [said('1', 'a'), said('2', 'b', 'character', 'ooc')])).toBe('b');
  });

  it('finds a message among its fork', () => {
    const messages = [
      { id: 'r', parent_id: null },
      { id: 'x', parent_id: 'r' },
      { id: 'y', parent_id: 'r' },
    ];
    expect(siblingsOf(messages, messages[2])).toEqual({ siblings: [messages[1], messages[2]], index: 1 });
  });

  it('makes the greetings one message’s swipes, without blanks', () => {
    expect(greetingSwipes('Hi', ['', 'Hello'])).toEqual(['Hi', 'Hello']);
    expect(greetingSwipes('', [])).toEqual([]);
  });
});
