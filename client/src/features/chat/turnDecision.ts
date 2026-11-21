// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who speaks next, by the decision model (the operator, 2026-11-21): after each line the decision
 * model chooses among the cast the AI plays (unmuted, never the person's seat), the AI GM
 * interjecting (not when the person is the GM), or a pause that waits for the person's input. What
 * it's told depends on the person's seat, named in the question. Pure, and held to
 * contract/turn-decision-cases.json, which the SaaS server's TurnDecision.py runs too. The caller
 * falls back to the turn order when there's no decision model or no usable answer.
 */
import { DECIDE_TURN } from '~/contract';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';

export type TurnSeat = 'gm' | 'character' | 'none';
export type TurnPick = { kind: 'character'; id: string } | { kind: 'gm' } | { kind: 'pause' };

/** The person's seat: the GM's, a character's (a player at the table, or one playing a character), or none. */
export function turnSeat(chatSeat: string | null, playing: boolean): TurnSeat {
  if (chatSeat === 'gm') return 'gm';
  return chatSeat === 'player' || playing ? 'character' : 'none';
}

/** The decision model's question, and what each of its options picks. */
export function turnQuestion(
  cast: readonly { id: string; name: string }[],
  muted: readonly string[],
  seatedId: string | null,
  seat: TurnSeat,
  player: string,
): { question: DecideQuestion; picks: Record<string, TurnPick> } {
  const fill = (text: string) => text.replaceAll('{{player}}', player);
  const picks: Record<string, TurnPick> = {};
  for (const member of cast) {
    if (muted.includes(member.id) || member.id === seatedId) continue;
    let name = member.name.trim() || 'Someone';
    for (let count = 2; name in picks; count += 1) name = `${member.name.trim() || 'Someone'} (${count})`;
    picks[name] = { kind: 'character', id: member.id };
  }
  if (seat !== 'gm') picks[DECIDE_TURN.gm] = { kind: 'gm' };
  picks[fill(DECIDE_TURN.pause[seat])] = { kind: 'pause' };
  return {
    question: { type: 'choice', instructions: fill(DECIDE_TURN.instructions[seat]), criteria: Object.keys(picks) },
    picks,
  };
}

/** What the decision model's answer picks, or null when it named no option. */
export function turnPick(
  answer: DecideAnswer | null | undefined,
  picks: Readonly<Record<string, TurnPick>>,
): TurnPick | null {
  if (answer === null || answer === undefined || !('choice' in answer)) return null;
  return picks[answer.choice] ?? null;
}

/** The recent story the decision model reads: its last lines, each "Name: text". */
export function turnState(lines: readonly { name: string; text: string }[]): string {
  return lines
    .slice(-DECIDE_TURN.window)
    .map((line) => `${line.name}: ${line.text}`)
    .join('\n');
}
