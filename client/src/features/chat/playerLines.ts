// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Structured lines (the operator, 2026-11-21): the person's message and the AI's answers, one item per
 * line, so every line says who speaks or acts. say: `Name (to Target): "text"` with an optional
 * manner (`to X, whispers`, `to everyone, shouts`, `vox to X`, `voxcast`); do: `Name action…`;
 * narrate: `Narrator: text`; any other line is narration. Pure, and held to
 * contract/player-lines-cases.json with ai_chat/PlayerLines.py.
 */
import { PLAYER_LINES, PROMPT } from '~/contract';

export type Manner = (typeof PLAYER_LINES.manners)[number];

export interface PlayerLine {
  speaker_id: string | null;
  kind: 'say' | 'do' | 'narrate';
  /** How a line is said; null for do and narrate. */
  manner: Manner | null;
  /** Whom it's said to or done at (a person), null for everyone or none. */
  target_id: string | null;
  /** The target as written, when it names no person ("the Neverborn"); null otherwise. */
  target_name: string | null;
  text: string;
}

type Person = { id: string; name: string };

/** Each person's name forms, longest first: the full name, and a first name unique among them. */
function forms(people: readonly Person[]): { form: string; id: string }[] {
  const firsts = new Map<string, number>();
  for (const person of people) {
    const first = person.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    firsts.set(first, (firsts.get(first) ?? 0) + 1);
  }
  const found: { form: string; id: string }[] = [];
  for (const person of people) {
    const full = person.name.trim();
    if (full === '') continue;
    found.push({ form: full, id: person.id });
    const first = full.split(/\s+/)[0] ?? '';
    if (
      first !== full &&
      first.length >= 3 &&
      !PLAYER_LINES.articles.includes(first.toLowerCase()) &&
      firsts.get(first.toLowerCase()) === 1
    )
      found.push({ form: first, id: person.id });
  }
  return found.sort((a, b) => b.form.length - a.form.length);
}

const named = (said: string, people: readonly Person[]): string | null =>
  forms(people).find((one) => one.form.toLowerCase() === said.trim().toLowerCase())?.id ?? null;

/** Who opens a line, and what follows the name; null when no one does. */
function opening(line: string, people: readonly Person[]): { id: string; rest: string } | null {
  for (const one of forms(people)) {
    if (line.slice(0, one.form.length).toLowerCase() !== one.form.toLowerCase()) continue;
    const rest = line.slice(one.form.length);
    if (rest === '' || /^[\s(:]/u.test(rest)) return { id: one.id, rest };
  }
  return null;
}

/**
 * A say line's words without their quotes: only a single quoted span is unquoted. Speech with an action
 * after it ("…tonight." She plants her hammer. "Sit.") keeps its quotes (build37: the first lost its
 * opening quote, the last its closing one).
 */
const unquote = (text: string): string => {
  const trimmed = text.trim();
  return /^["“][^"“”]*["”]$/u.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
};

/** How a say's parenthesis reads: its manner and its target (null: everyone). */
function said(
  paren: string,
  people: readonly Person[],
): { manner: Manner; target_id: string | null; target_name: string | null } {
  const text = paren.trim();
  if (text.toLowerCase() === 'voxcast') return { manner: 'voxcast', target_id: null, target_name: null };
  const vox = /^vox\s+to\s+(.+)$/iu.exec(text);
  if (vox !== null)
    return { manner: 'vox', target_id: target(vox[1] ?? '', people), target_name: unnamed(vox[1] ?? '', people) };
  const to = /^to\s+(.+?)(?:\s*,\s*(\w+))?$/iu.exec(text);
  if (to === null) return { manner: 'speak', target_id: null, target_name: null };
  const word = (to[2] ?? '').toLowerCase();
  const manner = (Object.entries(PLAYER_LINES.manner_words).find(([, verb]) => verb === word)?.[0] ?? 'speak') as Manner;
  return { manner, target_id: target(to[1] ?? '', people), target_name: unnamed(to[1] ?? '', people) };
}

const target = (name: string, people: readonly Person[]): string | null =>
  name.trim().toLowerCase() === PLAYER_LINES.everyone ? null : named(name, people);

/** A target as written when it names no person (and isn't everyone); null otherwise. */
const unnamed = (name: string, people: readonly Person[]): string | null =>
  name.trim() === '' || name.trim().toLowerCase() === PLAYER_LINES.everyone || named(name, people) !== null
    ? null
    : name.trim();

/** Who a line is spoken by, for a live stream's switch; null for the narrator or no one. */
export function lineSpeaker(line: string, people: readonly Person[]): string | null {
  const trimmed = line.trim();
  if (trimmed.toLowerCase().startsWith(`${PLAYER_LINES.narrator.toLowerCase()}:`)) return null;
  return opening(trimmed, people)?.id ?? null;
}

const NONE = { manner: null, target_id: null, target_name: null } as const;

/** A message's items, one per non-blank line. */
export function parsePlayerLines(text: string, people: readonly Person[]): PlayerLine[] {
  const items: PlayerLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const narrator = new RegExp(`^${PLAYER_LINES.narrator}:\\s*(.*)$`, 'isu').exec(line);
    if (narrator !== null) {
      items.push({ ...NONE, speaker_id: null, kind: 'narrate', text: (narrator[1] ?? '').trim() });
      continue;
    }
    const open = opening(line, people);
    if (open === null) {
      items.push({ ...NONE, speaker_id: null, kind: 'narrate', text: line });
      continue;
    }
    const say = /^\s*\(([^)]*)\)\s*:\s*(.*)$/su.exec(open.rest);
    if (say !== null) {
      items.push({ speaker_id: open.id, kind: 'say', ...said(say[1] ?? '', people), text: unquote(say[2] ?? '') });
      continue;
    }
    const colon = /^\s*:\s*(.*)$/su.exec(open.rest);
    if (colon !== null) {
      items.push({ ...NONE, speaker_id: open.id, kind: 'say', manner: 'speak', text: unquote(colon[1] ?? '') });
      continue;
    }
    // A do with its target (the operator: a punch at the hostile was read as at a team mate).
    const at = /^\s*\(at\s+([^)]+)\)\s*(.*)$/isu.exec(open.rest);
    if (at !== null) {
      const whom = at[1] ?? '';
      items.push({
        ...NONE,
        speaker_id: open.id,
        kind: 'do',
        target_id: target(whom, people),
        target_name: unnamed(whom, people),
        text: (at[2] ?? '').trim(),
      });
      continue;
    }
    items.push({ ...NONE, speaker_id: open.id, kind: 'do', text: open.rest.trim() });
  }
  return items;
}

/** Items as lines again: what parsePlayerLines reads back. */
export function formatPlayerLines(items: readonly PlayerLine[], people: readonly Person[]): string {
  const name = (id: string | null): string => people.find((person) => person.id === id)?.name.trim() ?? '';
  return items
    .map((item) => {
      const who = name(item.speaker_id);
      if (item.kind === 'narrate' || who === '') return `${PLAYER_LINES.narrator}: ${item.text}`;
      const whom = (item.target_id === null ? '' : name(item.target_id)) || (item.target_name ?? '');
      if (item.kind === 'do') return whom === '' ? `${who} ${item.text}` : `${who} (at ${whom}) ${item.text}`;
      const to = whom || PLAYER_LINES.everyone;
      const manner = item.manner ?? 'speak';
      const paren =
        manner === 'voxcast'
          ? 'voxcast'
          : manner === 'vox'
            ? `vox to ${to}`
            : manner === 'whisper' || manner === 'shout'
              ? `to ${to}, ${PLAYER_LINES.manner_words[manner]}`
              : `to ${to}`;
      return `${who} (${paren}): "${item.text}"`;
    })
    .join('\n');
}

/**
 * A line's text without the narrator's markup, for speech and summaries (the operator: screens and
 * colours): `[screen: …]` and `[/screen]` lines go and their contents stay; a palette colour's tags go
 * and its words stay. Anything else in brackets is left as written.
 */
export function stripMarkup(text: string): string {
  const colours = PROMPT.markup.colours.join('|');
  return (
    text
      .split('\n')
      .filter((line) => !/^\s*\[(?:screen:[^\]]*|\/screen)\]\s*$/iu.test(line))
      // A location banner reads as its place (the operator: a scene's move shown as a banner).
      .map((line) => line.replace(/^\s*\[location:\s*(.+?)\s*\]\s*$/iu, '$1.'))
      .join('\n')
      .replace(new RegExp(`\\[(?:${colours})\\]([\\s\\S]*?)\\[\\/(?:${colours})\\]`, 'giu'), '$1')
  );
}

/**
 * A narration's location banner (its first line `[location: Place]`), matched to a wiki location by
 * name or alias, case aside: the same place map_step and the world use. Null without a banner.
 */
export function locationLine(
  text: string,
  locations: readonly { id: string; name: string; aliases?: readonly string[] }[],
): { name: string; location_id: string | null } | null {
  const first = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const banner = /^\s*\[location:\s*(.+?)\s*\]\s*$/iu.exec(first);
  if (banner === null) return null;
  const said = (banner[1] ?? '').toLowerCase();
  const found = locations.find((location) =>
    [location.name, ...(location.aliases ?? [])].some((name) => name.trim().toLowerCase() === said),
  );
  return { name: found?.name ?? banner[1] ?? '', location_id: found?.id ?? null };
}

/**
 * A narration without any `[location: X]` line that doesn't name the seat's current place (by name or
 * alias, case aside), checked at save: the banner is server truth (map_step's seat_location), and the
 * narrator once cited the old place (the operator, 2026-11-21). With no current place, every one goes.
 */
export function dropStaleLocation(text: string, current: { name: string; aliases?: readonly string[] } | null): string {
  const names = current === null ? [] : [current.name, ...(current.aliases ?? [])].map((name) => name.trim().toLowerCase());
  return text
    .split('\n')
    .filter((line) => {
      const banner = /^\s*\[location:\s*(.+?)\s*\]\s*$/iu.exec(line);
      return banner === null || names.includes((banner[1] ?? '').toLowerCase());
    })
    .join('\n')
    .replace(/^\n+/u, '');
}
