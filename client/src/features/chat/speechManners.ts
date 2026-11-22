// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How a speaker may speak and to whom (the operator, 2026-11-22: "The additional speech modes should be
 * setting dependent (vox / vox caster in 40k only if one is in possession and message etc in DnD only if
 * spell is known)"). Always speak, whisper and shout to those present; a system's further manners only
 * when the speaker's sheet holds what each needs, matched by name: nothing on the sheet, no manner.
 * Pure, and held to contract/speech-options-cases.json with ai_chat/SpeechOptions.py.
 */
import { SPEECH_OPTIONS } from '~/contract';

export interface Holder {
  id: string;
  name: string;
  /** What they carry (the sheet's gear names) and know (its abilities' names). */
  gear?: readonly string[];
  abilities?: readonly string[];
  location_id?: string | null;
}
export interface Manner {
  id: string;
  label: string;
  reaches: 'present' | 'remote' | 'broadcast';
}

interface SystemManner {
  id: string;
  label: string;
  item?: readonly string[];
  spell?: readonly string[];
  reaches: string;
  to: string;
}

const has = (names: readonly string[] | undefined, wanted: readonly string[] | undefined): boolean =>
  wanted !== undefined && (names ?? []).some((name) => wanted.some((one) => name.toLowerCase().includes(one.toLowerCase())));
const qualifies = (holder: Holder, manner: SystemManner): boolean =>
  has(holder.gear, manner.item) || has(holder.abilities, manner.spell);

/** Whether two places are the same or beside each other: one inside the other, or both in one place. */
function nearby(
  a: string | null | undefined,
  b: string | null | undefined,
  parents: Record<string, string | null>,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const up = (id: string): string | null => parents[id] ?? null;
  return a === b || up(a) === b || up(b) === a || (up(a) !== null && up(a) === up(b));
}

export function speechManners(
  system: string | null,
  speaker: Holder,
  present: readonly { id: string; name: string }[],
  known: readonly Holder[],
  parents: Record<string, string | null>,
): { manners: Manner[]; present: { id: string; name: string }[]; remote: { id: string; name: string; via: string }[] } {
  const family = system === null ? undefined : (SPEECH_OPTIONS.families as Record<string, string>)[system];
  const offered = (
    family === undefined ? [] : ((SPEECH_OPTIONS.manners as Record<string, readonly SystemManner[]>)[family] ?? [])
  ).filter((manner) => qualifies(speaker, manner));
  const here = new Set(present.map((one) => one.id));
  const others = known.filter((one) => one.id !== speaker.id && !here.has(one.id));
  const remote: { id: string; name: string; via: string }[] = [];
  for (const manner of offered) {
    for (const one of others) {
      const reached =
        manner.to === 'known' ||
        (manner.to === 'carriers' && qualifies(one, manner)) ||
        (manner.to === 'nearby' && nearby(speaker.location_id, one.location_id, parents));
      if (reached && !remote.some((other) => other.id === one.id))
        remote.push({ id: one.id, name: one.name, via: manner.id });
    }
  }
  return {
    manners: [
      ...SPEECH_OPTIONS.base.map((one) => ({ id: one.id, label: one.label, reaches: 'present' as const })),
      ...offered.map((one) => ({ id: one.id, label: one.label, reaches: one.reaches as Manner['reaches'] })),
    ],
    present: present.map((one) => ({ id: one.id, name: one.name })),
    remote,
  };
}
