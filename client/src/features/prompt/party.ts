// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Party members know each other (the operator, 2026-11-21). The party is the chat's PCs (the wiki's
 * PC tag; every cast member when no record carries tags) plus whoever the person plays. Each party
 * voice reads the others with their one-line, its relationships to them and the party's shared
 * briefing; the narrator reads all of it. Pure, and held to contract/party-cases.json with Party.py.
 */
import { PARTY } from '~/contract';

export interface PartyEntity {
  id: string;
  kind: string;
  name: string;
  summary?: string;
  tags?: readonly string[] | null;
  gm_only?: boolean;
  deleted?: boolean;
  /** The wiki's relationships from this person: to whom, and how. */
  relationships?: readonly { to_id: string; kind?: string | null; note?: string | null }[] | null;
}

export interface PartyMember {
  id: string;
  name: string;
  line: string;
}

/** A summary's first sentence: how the others know someone at a glance. */
export function oneLine(summary: string | undefined): string {
  const text = (summary ?? '').trim().split('\n')[0] ?? '';
  const end = text.search(/[.!?](\s|$)/);
  return (end === -1 ? text : text.slice(0, end + 1)).trim();
}

/** The party: the chat's PCs (by tag, or every cast member when no record has tags) and the seat. */
export function partyOf(
  entities: readonly PartyEntity[],
  castIds: readonly string[],
  seatedId: string | null,
): PartyMember[] {
  const persons = new Map(
    entities.filter((entity) => entity.kind === 'person' && entity.deleted !== true).map((entity) => [entity.id, entity]),
  );
  const tagged = entities.some((entity) => Array.isArray(entity.tags));
  const ids = [...(seatedId === null ? [] : [seatedId]), ...castIds.filter((id) => id !== seatedId)];
  return ids.flatMap((id) => {
    const person = persons.get(id);
    if (person === undefined) return [];
    if (tagged && id !== seatedId && !(person.tags ?? []).includes(PARTY.tag)) return [];
    return [{ id, name: person.name, line: oneLine(person.summary) }];
  });
}

/** The party's shared briefing: the campaign's journals named as one, never GM-only, in name order. */
export function partyBriefing(entities: readonly PartyEntity[]): string[] {
  return entities
    .filter(
      (entity) =>
        entity.kind === 'journal' &&
        entity.deleted !== true &&
        entity.gm_only !== true &&
        PARTY.briefing_names.some((name) => entity.name.toLowerCase().includes(name)) &&
        (entity.summary ?? '').trim() !== '',
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entity) => (entity.summary ?? '').trim());
}

const member = (one: PartyMember): string => (one.line === '' ? one.name : `${one.name} (${one.line})`);

/**
 * The party block a voice reads: for a party member, the others (and its relationships to them);
 * for the narrator (speakerId null), everyone. Then the shared briefing. Nothing for a voice outside
 * the party.
 */
export function partyText(
  party: readonly PartyMember[],
  speakerId: string | null,
  entities: readonly PartyEntity[],
  briefing: readonly string[],
): string {
  const speaker = speakerId === null ? null : party.find((one) => one.id === speakerId);
  if (speakerId !== null && speaker === undefined) return '';
  const others = party.filter((one) => one.id !== speakerId);
  if (others.length === 0 && briefing.length === 0) return '';
  const lines: string[] = [];
  if (others.length > 0) {
    const members = others.map(member).join(', ');
    lines.push(
      speaker === null || speaker === undefined
        ? PARTY.narrator.replaceAll('{{members}}', members)
        : PARTY.voice.replaceAll('{{members}}', members),
    );
  }
  if (speaker !== null && speaker !== undefined) {
    const own = entities.find((entity) => entity.id === speaker.id)?.relationships ?? [];
    for (const relation of own) {
      const other = others.find((one) => one.id === relation.to_id);
      // The row's notes, else its kind ("sibling", "rival"); a tie with neither says nothing.
      const note = (relation.note ?? '').trim() || (relation.kind ?? '').trim();
      if (other !== undefined && note !== '')
        lines.push(PARTY.relationship.replaceAll('{{name}}', other.name).replaceAll('{{note}}', note));
    }
  }
  if (briefing.length > 0) lines.push([PARTY.briefing_heading, ...briefing].join('\n'));
  return lines.join('\n');
}
