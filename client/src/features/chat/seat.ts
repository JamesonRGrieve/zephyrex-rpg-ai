// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The person's seat at the table (the operator, 2026-11-21: "an option for the user to be either the
 * GM or the player. If they are a player and a party member, the rest of the party is ai piloted").
 *
 * - **player:** the person plays their PC; the chat's characters are the rest of the party, piloted
 *   by the AI; the AI GM runs the world. After the person's line, the party members who speak up
 *   act, then the GM narrates what happens.
 * - **gm:** the person runs the world; the chat's characters are the party, all piloted by the AI.
 *   After the GM's line, the party members who speak up answer it; the AI GM stays out.
 *
 * Who speaks up is SillyTavern's natural order: whoever the last line names, then each member
 * whose talkativeness wins its (seeded, so repeatable) draw. In the GM's seat someone always answers.
 */
import { mentionedSpeaker, seededDraw, type TurnMessage } from './turns';

export type Seat = 'player' | 'gm';

/** The AI GM's turn in a round, as opposed to a party member's id. */
export const GM_TURN = 'narrator';

export interface RoundInput {
  seat: Seat;
  characterIds: readonly string[];
  branch: readonly TurnMessage[];
  muted?: readonly string[];
  names?: ReadonlyMap<string, string>;
  talkativeness?: ReadonlyMap<string, number>;
}

/** The party members who act after the person's line, in order: the one named first, then the eager. */
export function speakingUp(input: RoundInput): string[] {
  const muted = input.muted ?? [];
  const members = input.characterIds.filter((id) => !muted.includes(id));
  if (members.length === 0) return [];
  const named = input.names === undefined ? null : mentionedSpeaker(members, input.branch, muted, input.names);
  const seed = input.branch.at(-1)?.id ?? '';
  const eager = members.filter((id) => id !== named && seededDraw(`${seed}:${id}`) < (input.talkativeness?.get(id) ?? 0.5));
  const acting = named === null ? eager : [named, ...eager];
  // The GM's seat always gets an answer: the party's first member when no one speaks up.
  if (acting.length === 0 && input.seat === 'gm') return [members[0] as string];
  return acting;
}

/** The turns the AI takes after the person's line: the party's, then the GM's narration in the player's seat. */
export function roundTurns(input: RoundInput): string[] {
  const party = speakingUp(input);
  return input.seat === 'player' ? [...party, GM_TURN] : party;
}
