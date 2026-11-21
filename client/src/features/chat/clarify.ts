// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The GM's question tool (the operator, 2026-11-21): when the person's do line leaves its target
 * ambiguous, the GM asks, out of game, and the options are only those present. Free first (a do with
 * no target, two or more candidates), then one decide call on whether it's truly ambiguous. Pure,
 * and held to contract/clarify-cases.json with ai_chat/Clarify.py.
 */
import { CLARIFY } from '~/contract';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';
import type { PlayerLine } from './playerLines';

/** The person's do line that may need a question: theirs, with no target, among two or more; else null. */
export function clarifyNeed(
  items: readonly PlayerLine[],
  seatId: string | null,
  candidates: readonly { id: string; name: string }[],
): { action: string } | null {
  if (candidates.length < 2 || seatId === null) return null;
  const item = items.find(
    (one) => one.kind === 'do' && one.speaker_id === seatId && one.target_id === null && one.target_name === null,
  );
  return item === undefined ? null : { action: item.text };
}

/** The decide question (is it ambiguous?) and the player's question with its options. */
export function clarifyQuestions(
  action: string,
  actor: string,
  candidates: readonly { id: string; name: string }[],
): { decide: DecideQuestion; player: { question: string; options: { label: string; value: string }[] } } {
  const fill = (text: string) =>
    text
      .replaceAll('{{actor}}', actor)
      .replaceAll('{{action}}', action)
      .replaceAll('{{candidates}}', candidates.map((one) => one.name).join(', '));
  return {
    decide: { type: 'noul', instructions: fill(CLARIFY.ambiguous) },
    player: {
      question: fill(CLARIFY.question),
      options: candidates.map((one) => ({ label: one.name, value: one.id })),
    },
  };
}

/** Whether the decide answer says ask: its probability at or over the threshold. */
export function shouldAsk(answer: DecideAnswer | null | undefined): boolean {
  const probability = answer === null || answer === undefined || !('probability' in answer) ? undefined : answer.probability;
  return typeof probability === 'number' && probability >= CLARIFY.threshold;
}
