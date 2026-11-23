// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A fight in the VTT's initiative order (rpg_combat): whose turn it is, an AI-run combatant's turn taken
 * by the decision model among the VTT's own options (POST /v1/ai_chat/combat_turn, Parity), and the turn
 * passed on. Mechanics are the VTT's: the result is its take_combat_action answer, never the model's.
 */
import { csrfHeaders } from '@zephyrex/auth/lib/session';

export interface Combatant {
  id: string;
  name: string;
  personId: string | null;
  defeated: boolean;
}

export interface Encounter {
  id: string;
  running: boolean;
  round: number;
  currentId: string | null;
  combatants: Combatant[];
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/api/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (response === null || !response.ok) return null;
  return response.json().catch(() => null);
}

/** The encounter as the VTT answers it, or null. */
export function readEncounter(raw: unknown): Encounter | null {
  const at = (key: string) => Reflect.get(Object(raw), key);
  const id = at('id');
  if (typeof id !== 'string') return null;
  const combatants = (Array.isArray(at('combatants')) ? (at('combatants') as unknown[]) : []).flatMap((one) => {
    const of = (key: string) => Reflect.get(Object(one), key);
    const cid = of('id');
    if (typeof cid !== 'string') return [];
    const person = of('person_id');
    const name = of('name');
    return [
      {
        id: cid,
        name: typeof name === 'string' ? name : 'Someone',
        personId: typeof person === 'string' ? person : null,
        defeated: of('is_defeated') === true,
      },
    ];
  });
  const current = at('current_combatant_id');
  return {
    id,
    running: at('status') === 'running',
    round: typeof at('round') === 'number' ? (at('round') as number) : 0,
    currentId: typeof current === 'string' ? current : null,
    combatants,
  };
}

/** The campaign's fight in progress, or null. */
export async function currentEncounter(campaignId: string): Promise<Encounter | null> {
  const answer = await post('encounter/current', { current: { campaign_id: campaignId } });
  const encounter = readEncounter(Reflect.get(Object(answer), 'encounter'));
  return encounter !== null && encounter.running ? encounter : null;
}

/** The turn passed to the next combatant; the encounter after, or null. */
export async function nextTurn(encounterId: string): Promise<Encounter | null> {
  return readEncounter(Reflect.get(Object(await post(`encounter/${encounterId}/next`, { control: {} })), 'encounter'));
}

export interface CombatTurn {
  acted: boolean;
  reason: string;
  targetIds: string[];
  result: Record<string, unknown> | null;
}

/** An AI-run combatant's turn, decided among the VTT's options and taken by the VTT; null on any failure. */
export async function combatTurn(chatId: string, encounterId: string, personId: string): Promise<CombatTurn | null> {
  const answer = Reflect.get(
    Object(
      await post('ai_chat/combat_turn', {
        combat_turn: { chat_id: chatId, encounter_id: encounterId, person_id: personId },
      }),
    ),
    'combat_turn',
  );
  if (answer === undefined || answer === null) return null;
  const result = Reflect.get(Object(answer), 'result');
  const reason = Reflect.get(Object(answer), 'reason');
  const targets = Reflect.get(Object(answer), 'target_ids');
  return {
    acted: Reflect.get(Object(answer), 'acted') === true,
    targetIds: Array.isArray(targets) ? targets.filter((one): one is string => typeof one === 'string') : [],
    reason: typeof reason === 'string' ? reason : '',
    result: result !== null && typeof result === 'object' ? (result as Record<string, unknown>) : null,
  };
}

/** The VTT's result as a roll line: who did it, to whom, the roll, the hit and the damage. */
export function combatLine(actor: string, targets: readonly string[], result: Record<string, unknown> | null): string {
  if (result === null) return `${actor} holds.`;
  const roll = result.roll;
  const rolled = typeof roll === 'number' ? ` (rolled ${roll})` : '';
  const whom = targets.length > 0 ? ` ${targets.join(', ')}` : '';
  const hit = result.hit === true;
  const damage = typeof result.damage === 'number' && hit ? `, ${result.damage} damage` : '';
  const left = typeof result.target_hp === 'number' && hit ? `; ${result.target_hp} HP left` : '';
  const down = result.target_defeated === true ? '; down' : '';
  return `${actor} attacks${whom}${rolled}: ${hit ? 'hit' : 'miss'}${damage}${left}${down}.`;
}

/** Whose turn it is, when the AI runs them (`aiRuns` of their person) and they're still standing. */
export function aiTurn(encounter: Encounter, aiRuns: (personId: string) => boolean): Combatant | null {
  const now = encounter.combatants.find((one) => one.id === encounter.currentId);
  if (now === undefined || now.defeated || now.personId === null || !aiRuns(now.personId)) return null;
  return now;
}

/**
 * Whether the story line at `leafId` starts a fight (Parity's combat_check): the decision model judges, and
 * on yes the VTT starts the encounter with everyone on the scene, rolls initiative and begins round 1.
 * Null on any failure (an older server has no such route).
 */
export async function combatCheck(
  chatId: string,
  leafId: string,
): Promise<{ started: boolean; encounterId: string | null; reason: string } | null> {
  const answer = Reflect.get(
    Object(await post('ai_chat/combat_check', { combat_check: { chat_id: chatId, leaf_id: leafId } })),
    'combat_check',
  );
  if (answer === undefined || answer === null) return null;
  const id = Reflect.get(Object(answer), 'encounter_id');
  const reason = Reflect.get(Object(answer), 'reason');
  return {
    started: Reflect.get(Object(answer), 'started') === true,
    encounterId: typeof id === 'string' ? id : null,
    reason: typeof reason === 'string' ? reason : '',
  };
}
