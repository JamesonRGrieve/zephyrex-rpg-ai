// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GM_TURN, roundTurns, speakingUp } from './seat';
import type { TurnMessage } from './turns';

const line = (id: string, text: string): TurnMessage => ({
  id,
  parent_id: null,
  role: 'user',
  channel: 'ic',
  speaker_character_id: null,
  swipes: [text],
  swipe_index: 0,
});

const party = ['a', 'b', 'c'];
const names = new Map([
  ['a', 'Ada'],
  ['b', 'Bo'],
  ['c', 'Cy'],
]);

describe('roundTurns', () => {
  it('in the player’s seat, the party members who speak up act, then the GM narrates', () => {
    const talk = new Map([
      ['a', 1],
      ['b', 0],
      ['c', 1],
    ]);
    expect(
      roundTurns({ seat: 'player', characterIds: party, branch: [line('m1', 'I open the door.')], talkativeness: talk }),
    ).toEqual(['a', 'c', GM_TURN]);
  });

  it('in the player’s seat, the GM narrates even when no one in the party speaks up', () => {
    const quiet = new Map(party.map((id) => [id, 0]));
    expect(
      roundTurns({ seat: 'player', characterIds: party, branch: [line('m1', 'I wait.')], talkativeness: quiet }),
    ).toEqual([GM_TURN]);
  });

  it('in the GM’s seat, the party answers and the AI GM stays out; someone always answers', () => {
    const quiet = new Map(party.map((id) => [id, 0]));
    expect(
      roundTurns({ seat: 'gm', characterIds: party, branch: [line('m1', 'The bridge shakes.')], talkativeness: quiet }),
    ).toEqual(['a']);
  });

  it('the member the line names acts first, once', () => {
    const talk = new Map(party.map((id) => [id, 1]));
    expect(
      speakingUp({
        seat: 'gm',
        characterIds: party,
        branch: [line('m1', 'Cy, what do you see?')],
        names,
        talkativeness: talk,
      }),
    ).toEqual(['c', 'a', 'b']);
  });

  it('a muted member never acts; an all-muted party leaves only the GM', () => {
    const talk = new Map(party.map((id) => [id, 1]));
    const branch = [line('m1', 'Ada?')];
    expect(speakingUp({ seat: 'gm', characterIds: party, branch, names, muted: ['a'], talkativeness: talk })).toEqual([
      'b',
      'c',
    ]);
    expect(roundTurns({ seat: 'player', characterIds: party, branch, muted: party })).toEqual([GM_TURN]);
  });

  it('the same chat state gives the same round', () => {
    const input = { seat: 'player' as const, characterIds: party, branch: [line('m9', 'Onward.')] };
    expect(roundTurns(input)).toEqual(roundTurns(input));
  });
});
