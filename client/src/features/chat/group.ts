// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Group guards (SillyTavern's name stop strings): in a scene with several speakers, a reply ends
 * where it starts someone else's line. "\nName:" for the person, then the cast, never the
 * speaker; narrating, only the person's; writing the person's own line, the cast's.
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
export function groupStops(mode: GuardMode, speaker: string, cast: readonly string[], person: string): string[] {
  if (mode === 'table') return [];
  const others = cast.filter((name) => name !== speaker);
  const names = mode === 'impersonate' ? others : mode === 'narrate' ? [person] : [person, ...others];
  return [...new Set(names.map((name) => name.trim()).filter((name) => name !== '' && name !== speaker))]
    .slice(0, cases.max_stops)
    .map((name) => `\n${name}:`);
}
