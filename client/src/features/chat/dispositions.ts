// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Grounded state (the operator, 2026-11-21: a barkeep asked the man who'd just defiled her hearth for
 * directions in her own town): each person's stance toward each other person, with a short reason,
 * kept on the chat and updated by the summary model in the same call as the status line. Each voice
 * reads who is here and its own stances; the narrator reads everyone's. Pure, and held to
 * contract/disposition-cases.json with ai_chat/Dispositions.py.
 */
import { DISPOSITIONS } from '~/contract';
import { statusClean } from './statusLine';

export type Stance = (typeof DISPOSITIONS.stances)[number];
export type Dispositions = Record<string, Record<string, { stance: Stance; reason: string }>>;
export interface StanceUpdate {
  who: string;
  toward: string;
  stance: Stance;
  reason: string;
}

/** The summary model's answer: its status line and the stances it changed (a plain line works too). */
export function parseStatus(text: string): { line: string; updates: StanceUpdate[] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let parsed: unknown = null;
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  const line: unknown = Reflect.get(Object(parsed), 'status_line');
  if (typeof line !== 'string') return { line: statusClean(text), updates: [] };
  const listed: unknown = Reflect.get(Object(parsed), 'dispositions');
  const updates = (Array.isArray(listed) ? listed : []).flatMap((one: unknown): StanceUpdate[] => {
    const field = (key: string): unknown => Reflect.get(Object(one), key);
    const [who, toward, stance, reason] = [field('who'), field('toward'), field('stance'), field('reason')];
    return typeof who === 'string' &&
      typeof toward === 'string' &&
      typeof stance === 'string' &&
      (DISPOSITIONS.stances as readonly string[]).includes(stance)
      ? [
          {
            who: who.trim(),
            toward: toward.trim(),
            stance: stance as Stance,
            reason: typeof reason === 'string' ? reason.trim() : '',
          },
        ]
      : [];
  });
  return { line: statusClean(line), updates };
}

/** The chat's stances after updates, names resolved among the people (case aside); unknown names skipped. */
export function applyStances(
  current: Dispositions,
  updates: readonly StanceUpdate[],
  people: readonly { id: string; name: string }[],
): Dispositions {
  const idOf = (name: string): string | undefined =>
    people.find((person) => person.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;
  const next: Dispositions = Object.fromEntries(Object.entries(current).map(([who, row]) => [who, { ...row }]));
  for (const update of updates) {
    const who = idOf(update.who);
    const toward = idOf(update.toward);
    if (who === undefined || toward === undefined || who === toward) continue;
    next[who] = { ...(next[who] ?? {}), [toward]: { stance: update.stance, reason: update.reason } };
  }
  return next;
}

/**
 * What a voice reads of the scene: who is here (with their one-line), then its own stances toward
 * them; the narrator (viewerId null) reads everyone's. Empty with fewer than two here (nothing to relate).
 */
export function sceneState(
  here: readonly { id: string; name: string; line: string }[],
  dispositions: Dispositions,
  viewerId: string | null,
): string {
  if (here.length < 2) return '';
  const name = new Map(here.map((one) => [one.id, one.name]));
  const lines = [
    `${DISPOSITIONS.here_heading} ${here.map((one) => (one.line === '' ? one.name : `${one.name} (${one.line})`)).join(', ')}`,
  ];
  for (const who of here) {
    if (viewerId !== null && who.id !== viewerId) continue;
    for (const [toward, stance] of Object.entries(dispositions[who.id] ?? {})) {
      const target = name.get(toward);
      if (target === undefined) continue;
      lines.push(
        DISPOSITIONS.stance_line
          .replaceAll('{{who}}', who.name)
          .replaceAll('{{toward}}', target)
          .replaceAll('{{stance}}', stance.stance)
          .replaceAll('{{reason}}', stance.reason),
      );
    }
  }
  return lines.join('\n');
}
