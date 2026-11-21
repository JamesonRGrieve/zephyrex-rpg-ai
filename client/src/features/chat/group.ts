// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Group guards (SillyTavern's name stop strings): in a scene with several speakers, a reply ends
 * where it starts someone else's line. "\nName:" for the person, then the cast, never the
 * speaker; narrating, the person's and every cast member's (the narrator never speaks for them);
 * writing the person's own line, the cast's.
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
  // The narrator may voice the cast only in @@Name interludes, so it stops only at the seat.
  const seatStops =
    mode === 'impersonate' || seat === ''
      ? []
      : mode === 'narrate'
        ? [`\n@@${seat}`, `\n${seat}:`]
        : [`\n${seat}:`, `\n*${first}`];
  // The narrator voices the cast only in @@ interludes: their "Name:" lines stop it too.
  const castStops = others
    .map((name) => name.trim())
    .filter((name) => name !== '' && name !== speaker && name !== seat)
    .map((name) => `\n${name}:`);
  return [...new Set([...seatStops, ...castStops])].slice(0, cases.max_stops);
}
