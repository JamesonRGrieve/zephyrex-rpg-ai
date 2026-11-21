// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Group guards (SillyTavern's name stop strings): in a scene with several speakers, a reply ends
 * where it starts someone else's structured line ("\nName", say or do; playerLines.ts): the
 * person's seat first (its name and "*First"), then the cast's, the most recent speakers first,
 * never the speaker's; narrating, the seat's only (the narrator may write the cast's lines);
 * writing the person's own line, the cast's. Four at most.
 *
 * SillyTavern's group nudge (a trailing system line naming the speaker) is left out: against the
 * lab's Cydonia 24B it made replies worse (markdown headings, invented characters and rolls) in
 * the live campaign e2e's A/B (2026-11-21).
 *
 * Pure. Twinned by server/extensions/ai_chat/Group.py, both held to contract/group-cases.json.
 */
import cases from '../../../../contract/group-cases.json';

export type GuardMode = 'reply' | 'continue' | 'impersonate' | 'table' | 'narrate';

/** The stop strings for one turn: `cast` is the AI's characters, `person` who the person speaks as. */
export function groupStops(
  mode: GuardMode,
  speaker: string,
  cast: readonly string[],
  person: string,
  recent: readonly string[] = [],
): string[] {
  if (mode === 'table') return [];
  // The most recent speakers first (the play-test: the narrator wrote "The Acolyte: …").
  const others = [...recent.filter((name) => cast.includes(name)), ...cast].filter((name) => name !== speaker);
  const seat = person.trim();
  const first = seat.split(/\s+/)[0] ?? '';
  // Nobody writes for the person's seat (the operator's play-test): its line-start forms come first.
  const seatStops = mode === 'impersonate' || seat === '' ? [] : [`\n${seat}`, `\n*${first}`];
  // Structured lines (playerLines.ts): a line opening with a name is that person's, say or do; the
  // narrator may write the cast's lines, a voice only its own.
  const castStops = (mode === 'narrate' ? [] : others)
    .map((name) => name.trim())
    .filter((name) => name !== '' && name !== speaker && name !== seat)
    .map((name) => `\n${name}`);
  return [...new Set([...seatStops, ...castStops])].slice(0, cases.max_stops);
}
