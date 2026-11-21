// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The narrator's interludes and the free-text check (the operator, 2026-11-21). The narrator may voice
 * any cast member but the person's seat, only in an interlude: a line `@@Name`, their words and
 * actions, then `@@Narrator`. narrateSegments splits a narration into its parts, so each is saved as
 * its own message credited to who spoke; the seat's name cuts it there. speaksFor and strangerIn are
 * text matches, no model call: prose quoting the seat's dialogue, or a party voice treating another
 * as a stranger, so the caller regenerates once with the span forbidden. Pure, and held to
 * contract/voice-guard-cases.json with ai_chat/VoiceGuard.py.
 */
import { PROMPT, VOICE_GUARD } from '~/contract';

export interface Segment {
  /** The cast member speaking in an interlude, or null for the narrator. */
  speaker_id: string | null;
  text: string;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (text: string, needle: string): boolean =>
  needle !== '' && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(needle)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
const nameForms = (name: string): string[] => {
  const full = name.trim();
  const first = full.split(/\s+/)[0] ?? '';
  // A title's article is no name: "The Acolyte" is never "The".
  const usable = first.length >= 3 && first !== full && !['the', 'a', 'an'].includes(first.toLowerCase());
  return [full, ...(usable ? [first] : [])].filter((form) => form !== '');
};
const isNamed = (said: string, name: string): boolean =>
  nameForms(name).some((form) => form.toLowerCase() === said.trim().toLowerCase());

/** A one-line's head noun: its first word that isn't small or a stop word ("A thief with…" → thief). */
function headNoun(line: string): string {
  return (
    line
      .toLowerCase()
      .split(/[^\p{L}\p{N}']+/u)
      .find((one) => one.length >= VOICE_GUARD.min_word && !VOICE_GUARD.stop_words.includes(one)) ?? ''
  );
}

/** Where a paragraph first mentions a member: by name, first name, or "the <head noun>"; -1 if never. */
function mentionAt(text: string, member: { name: string; line?: string }): number {
  const forms = [...nameForms(member.name)];
  const head = headNoun(member.line ?? '');
  const at = (pattern: RegExp): number => pattern.exec(text)?.index ?? -1;
  const found = [
    ...forms.map((form) => at(new RegExp(`(?<![\\p{L}\\p{N}])${escaped(form)}(?![\\p{L}\\p{N}])`, 'iu'))),
    ...(head === '' ? [] : [at(new RegExp(`(?<![\\p{L}\\p{N}])the\\s+${escaped(head)}(?![\\p{L}\\p{N}])`, 'iu'))]),
  ].filter((one) => one >= 0);
  return found.length === 0 ? -1 : Math.min(...found);
}

/**
 * The fallback when the narrator writes a cast member in prose (the play-test): in a paragraph with
 * quoted speech, the member it first mentions (by name or as "the <their head noun>") speaks it; from
 * that mention (or the first quote) through the last quote and its trailing attribution is their
 * interlude, and the prose around it stays the narrator's. Null when nobody can be named.
 */
function attributed(
  line: string,
  cast: readonly { id: string; name: string; line?: string }[],
): { before: string; id: string; body: string; after: string } | null {
  const all = sentences(line);
  const quoted = all.map((sentence) => quotes(sentence.text));
  const first = quoted.indexOf(true);
  if (first === -1) return null;
  let last = quoted.lastIndexOf(true);
  // "…?' she hisses." belongs with the speech it attributes.
  while (last + 1 < all.length && /^\p{Ll}/u.test(all[last + 1]?.text ?? '')) last += 1;
  const end = (all[last]?.at ?? 0) + (all[last]?.text.length ?? 0);
  const reach = line.slice(0, end);
  const named = cast
    .map((member) => ({ member, at: mentionAt(reach, member) }))
    .filter((one) => one.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (named === undefined) return null;
  const startIndex = Math.min(
    first,
    all.findIndex((sentence) => sentence.at + sentence.text.length > named.at),
  );
  const start = all[startIndex]?.at ?? 0;
  return { before: line.slice(0, start), id: named.member.id, body: line.slice(start, end), after: line.slice(end) };
}

/** A narration's parts in order: the narrator's and each interlude's, the seat's name cutting it there. */
export function narrateSegments(
  text: string,
  cast: readonly { id: string; name: string; line?: string }[],
  seat: string,
): Segment[] {
  const parts: { speaker_id: string | null; lines: string[] }[] = [];
  const push = (who: string | null, line: string): void => {
    const last = parts.at(-1);
    if (last !== undefined && last.speaker_id === who) last.lines.push(line);
    else parts.push({ speaker_id: who, lines: [line] });
  };
  const leads = (line: string, name: string): boolean =>
    nameForms(name).some((form) => new RegExp(`^\\*\\s*${escaped(form)}($|[^\\p{L}\\p{N}])`, 'iu').test(line));
  const isSeat = (said: string): boolean => seat.trim() !== '' && isNamed(said, seat);
  let speaker: string | null = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(PROMPT.interlude_mark)) {
      const said = trimmed.slice(PROMPT.interlude_mark.length).trim();
      if (isSeat(said)) break;
      speaker = cast.find((member) => isNamed(said, member.name))?.id ?? null;
      continue;
    }
    // The play-test: a line in a cast member's name ("The Acolyte: …" or "*The Acolyte …") is theirs too,
    // for that line; the seat's name cuts the narration there.
    const tagged = /^([^:\n]{1,60}):\s*(.*)$/u.exec(trimmed);
    if (tagged !== null && (isSeat(tagged[1] ?? '') || cast.some((member) => isNamed(tagged[1] ?? '', member.name)))) {
      if (isSeat(tagged[1] ?? '')) break;
      push(cast.find((member) => isNamed(tagged[1] ?? '', member.name))?.id ?? null, tagged[2] ?? '');
      continue;
    }
    if (trimmed.startsWith('*')) {
      if (seat.trim() !== '' && leads(trimmed, seat)) break;
      const actor = cast.find((member) => leads(trimmed, member.name));
      if (actor !== undefined) {
        push(actor.id, line);
        continue;
      }
    }
    if (speaker === null) {
      const split = attributed(line, cast);
      if (split !== null) {
        if (split.before.trim() !== '') push(null, split.before);
        push(split.id, split.body);
        if (split.after.trim() !== '') push(null, split.after);
        continue;
      }
    }
    push(speaker, line);
  }
  const segments: Segment[] = [];
  for (const part of parts) {
    const body = part.lines.join('\n').trim();
    if (body === '') continue;
    const last = segments.at(-1);
    if (last !== undefined && last.speaker_id === part.speaker_id) last.text = `${last.text}\n\n${body}`;
    else segments.push({ speaker_id: part.speaker_id, text: body });
  }
  return segments;
}

/** A text's sentences, each with where it starts: split at . ! ? (and a closing quote) before a space, and at line ends. */
function sentences(text: string): { at: number; text: string }[] {
  const found: { at: number; text: string }[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    for (const match of line.matchAll(/[^.!?]*(?:[.!?]+["”’']?(?=\s|$))?/gu)) {
      const body = match[0].trim();
      if (body !== '')
        found.push({ at: offset + match.index + (match[0].length - match[0].trimStart().length), text: body });
    }
    offset += line.length + 1;
  }
  return found;
}

const quotes = (sentence: string): boolean => /["“”‘’]|(^|\s)'/u.test(sentence);

/** Whether a sentence names someone: by name, first name, or enough words of their one-line descriptor. */
function names(sentence: string, ref: { name: string; line: string }): boolean {
  if (nameForms(ref.name).some((form) => word(sentence, form))) return true;
  const words = [
    ...new Set(
      ref.line
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .filter((one) => one.length >= VOICE_GUARD.min_word && !VOICE_GUARD.stop_words.includes(one)),
    ),
  ];
  return words.filter((one) => word(sentence, one)).length >= VOICE_GUARD.descriptor_words;
}

/** The first sentence that quotes dialogue and names one of `refs` (the seat), with where to cut; or null. */
export function speaksFor(
  text: string,
  refs: readonly { name: string; line: string }[],
): { at: number; span: string } | null {
  const all = sentences(text);
  for (const [index, sentence] of all.entries()) {
    if (!refs.some((ref) => names(sentence.text, ref))) continue;
    if (quotes(sentence.text)) return { at: sentence.at, span: sentence.text };
    // "The woman with the brass hand laughed." then "'I'm looking for my cell.'": the line is hers.
    const next = all[index + 1];
    if (next !== undefined && /^["“‘']/u.test(next.text)) return { at: sentence.at, span: `${sentence.text} ${next.text}` };
  }
  return null;
}

/** The first sentence where a party voice treats someone as a stranger; or null. */
export function strangerIn(text: string): { at: number; span: string } | null {
  const hit = sentences(text).find((sentence) =>
    VOICE_GUARD.stranger_phrases.some((phrase) => sentence.text.toLowerCase().includes(phrase)),
  );
  return hit === undefined ? null : { at: hit.at, span: hit.text };
}
