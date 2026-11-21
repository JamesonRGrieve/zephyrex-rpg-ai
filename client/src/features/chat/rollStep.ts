// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The roll after a character acts (the operator, 2026-11-21: "After a character's turn, the decision
 * model must also decide if a roll is required and what roll, the system then makes the roll, and the
 * next turn is always the narrator narrating the result"). The decision is the server's
 * (POST /v1/ai_chat/needs_roll, features/chat/rollDecision.ts); the roll is the VTT's (rpg_dice test or
 * formula), or local dice where no dice route answers (lite). Mechanics are never invented by a model.
 */
import { lightOutcome } from './rollDecision';
import { csrfHeaders } from '@zephyrex/auth/lib/session';

export type NeededRoll =
  | { kind: 'test'; personId: string; name: string; difficulty: string | null; label: string }
  | { kind: 'formula'; personId: string | null; formula: string; label: string };

/** The decided roll after `characterId`'s line, or null (none, undecided, or any failure). */
export async function decideRoll(chatId: string, leafId: string, characterId: string): Promise<NeededRoll | null> {
  const response = await fetch('/api/v1/ai_chat/needs_roll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify({ needs_roll: { chat_id: chatId, leaf_id: leafId, character_id: characterId } }),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  const answer = Object(Reflect.get(Object(await response.json().catch(() => null)), 'needs_roll')) as Record<string, unknown>;
  if (answer.decided !== true) return null;
  const label = typeof answer.label === 'string' ? answer.label : '';
  const personId = typeof answer.person_id === 'string' ? answer.person_id : characterId;
  if (answer.kind === 'test' && typeof answer.name === 'string')
    return {
      kind: 'test',
      personId,
      name: answer.name,
      difficulty: typeof answer.difficulty === 'string' ? answer.difficulty : null,
      label: label || answer.name,
    };
  if (answer.kind === 'formula' && typeof answer.formula === 'string')
    return { kind: 'formula', personId, formula: answer.formula, label: label || answer.formula };
  return null;
}

/** Local dice for a plain NdM(+K) formula (lite has no dice routes); null when it isn't one. */
export function rollLocally(formula: string, random: () => number = Math.random): number | null {
  const match = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(formula);
  if (match === null) return null;
  const count = Number(match[1] || '1');
  const sides = Number(match[2]);
  if (count < 1 || count > 100 || sides < 2) return null;
  let total = Number((match[3] ?? '0').replace(/\s/g, ''));
  for (let die = 0; die < count; die += 1) total += 1 + Math.floor(random() * sides);
  return total;
}

async function post(path: string, body: object): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

/** Rolls the decided roll and answers the roll line: who rolled what, and how it fell. */
export async function makeRoll(roll: NeededRoll, who: string): Promise<string> {
  if (roll.kind === 'test') {
    const answer = Reflect.get(
      Object(
        await post('/v1/dice/test', {
          test: { person_id: roll.personId, name: roll.name, modifiers: [], ...(roll.difficulty ? { difficulty: roll.difficulty } : {}) },
        }),
      ),
      'test',
    ) as Record<string, unknown>;
    const outcome = answer.success === true ? 'succeeds' : 'fails';
    const degrees = typeof answer.degrees === 'number' ? `, ${answer.degrees} degree${answer.degrees === 1 ? '' : 's'}` : '';
    return `${who}: ${roll.label}. Rolled ${String(answer.roll)} against ${String(answer.target)}: ${outcome}${degrees}.`;
  }
  let total: number | null = null;
  try {
    const answer = Reflect.get(Object(await post('/v1/dice/roll', { roll: { formula: roll.formula } })), 'roll');
    const value = Reflect.get(Object(answer), 'total');
    total = typeof value === 'number' ? value : null;
  } catch {
    total = rollLocally(roll.formula);
  }
  if (total === null) throw new Error(`The dice (${roll.formula}) were not rolled`);
  const band = lightOutcome(total);
  return `${who}: rolled ${roll.label}: ${total}${band ? `, ${band}` : ''}.`;
}
