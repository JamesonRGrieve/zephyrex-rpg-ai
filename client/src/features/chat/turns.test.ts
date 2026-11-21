// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  greetingSwipes,
  nextSpeaker,
  openingTurns,
  seededDraw,
  siblingsOf,
  talkativenessOf,
  type TurnMessage,
} from './turns';

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

describe('natural order and group greetings (A52)', () => {
  const names = new Map([
    ['a', 'Ada'],
    ['b', 'Bram'],
    ['c', 'Cy'],
  ]);
  const line = (id: string, speaker: string | null, text: string, role = 'character') => ({
    id,
    parent_id: null,
    role,
    channel: 'ic',
    speaker_character_id: speaker,
    swipes: [text],
    swipe_index: 0,
  });

  it('lets the member the last story line names speak next, the earliest named first', () => {
    expect(nextSpeaker(['a', 'b', 'c'], [line('1', null, 'Cy, then Bram: get the door.', 'user')], [], names)).toBe('c');
    // Not the one who said it, nor a muted member, nor a name inside a word.
    expect(nextSpeaker(['a', 'b', 'c'], [line('1', 'a', 'Ada will wait. Bram?')], ['b'], names)).toBe('c');
    expect(nextSpeaker(['a', 'b', 'c'], [line('1', 'a', 'Brambles everywhere.')], [], names)).toBe('b');
  });

  it('falls back to turns when no one is named, or without names', () => {
    expect(nextSpeaker(['a', 'b', 'c'], [line('1', 'a', 'Quiet.')], [], names)).toBe('b');
    expect(nextSpeaker(['a', 'b', 'c'], [line('1', null, 'Cy?', 'user')])).toBe('a');
  });

  it('opens a group with each member’s greeting in turn', () => {
    expect(
      openingTurns([
        { id: 'a', first_message: 'Hello.', alternate_greetings: ['Hi.'] },
        { id: 'b', first_message: ' ', alternate_greetings: [] },
        { id: 'c', first_message: 'Yo.', alternate_greetings: [] },
      ]),
    ).toEqual([
      { speakerId: 'a', swipes: ['Hello.', 'Hi.'] },
      { speakerId: 'c', swipes: ['Yo.'] },
    ]);
  });
});

describe('talkativeness (gap 7)', () => {
  const ids = ['a', 'b', 'c'];
  const line = (id: string, speaker: string | null): TurnMessage => ({
    id,
    parent_id: null,
    role: speaker === null ? 'user' : 'character',
    channel: 'ic',
    speaker_character_id: speaker,
  });

  it('reads a card’s talkativeness, 0.5 when unset or unreadable, kept within 0 and 1', () => {
    expect(talkativenessOf({ talkativeness: '0.8' })).toBe(0.8);
    expect(talkativenessOf({ talkativeness: 0.1 })).toBe(0.1);
    expect(talkativenessOf({ talkativeness: 'loud' })).toBe(0.5);
    expect(talkativenessOf({ talkativeness: 3 })).toBe(1);
    expect(talkativenessOf(undefined)).toBe(0.5);
  });

  it('draws the same for the same seed, within 0 and 1', () => {
    expect(seededDraw('m1:a')).toBe(seededDraw('m1:a'));
    for (const seed of ['', 'x', 'm1:b', 'long seed text']) {
      expect(seededDraw(seed)).toBeGreaterThanOrEqual(0);
      expect(seededDraw(seed)).toBeLessThan(1);
    }
  });

  it('a silent member is passed over and an eager one always speaks; all silent falls back to the order', () => {
    const branch = [line('m1', 'a'), line('m2', null)];
    const talk = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ]);
    expect(nextSpeaker(ids, branch, [], new Map(), talk)).toBe('c');
    const quiet = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
    expect(nextSpeaker(ids, branch, [], new Map(), quiet)).toBe('b');
  });

  it('a muted member never speaks, however talkative, and naming still comes first', () => {
    const branch = [line('m1', 'a'), line('m2', null)];
    expect(nextSpeaker(ids, branch, ['c'], new Map(), new Map([['c', 1]]))).not.toBe('c');
    const named = [line('m1', 'a'), { ...line('m2', null), swipes: ['Bo, what now?'], swipe_index: 0 }];
    const cast = new Map([
      ['a', 'Ada'],
      ['b', 'Bo'],
      ['c', 'Cy'],
    ]);
    expect(nextSpeaker(ids, named, [], cast, new Map([['c', 1]]))).toBe('b');
  });

  it('alone, the one character speaks whatever its talkativeness', () => {
    expect(nextSpeaker(['a'], [line('m1', null)], [], new Map(), new Map([['a', 0]]))).toBe('a');
  });
});
