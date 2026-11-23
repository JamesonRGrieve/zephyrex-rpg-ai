// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Schema-constrained turns (the operator, 2026-11-21: "Still fucking up dialogue with the narrator and
 * character sections"): the model answers JSON `{"items": [{kind, speaker, target, manner, text}]}`, so
 * every beat is credited by construction, never by splitting prose. Three pure parts, held to
 * contract/structured-cases.json with ai_chat/Structured.py:
 * - turnSchema: the JSON schema a chat API is asked for (response_format json_schema);
 * - ItemStream: the streaming answer read as it comes, each item's start, text and end;
 * - structuredRuns: the finished items as messages, one per speaker run, cut at the seat.
 */
import { PLAYER_LINES, STRUCTURED } from '~/contract';
import { type Manner, type PlayerLine, formatPlayerLines } from './playerLines';
import { echoOf, replayOf, seatCut } from './voiceGuard';

export type ItemKind = (typeof STRUCTURED.kinds)[number];

/** The JSON schema for one turn. `text` comes last, so an item's other fields are known before it streams. */
export function turnSchema(): Record<string, unknown> {
  const nullable = (description: string) => ({ type: ['string', 'null'], description });
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...STRUCTURED.kinds] },
            speaker: nullable(STRUCTURED.descriptions.speaker),
            target: nullable(STRUCTURED.descriptions.target),
            manner: { type: ['string', 'null'], enum: [...PLAYER_LINES.manners, null] },
            text: { type: 'string', description: STRUCTURED.descriptions.text },
          },
          required: ['kind', 'speaker', 'target', 'manner', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

/** One item as far as it has been read: its fields, its text so far, and whether each is finished. */
export interface PartialItem {
  fields: Record<string, string | null>;
  /** Whether the `text` key has been reached (its value may still be streaming). */
  has_text: boolean;
  text: string;
  closed: boolean;
}

/** A JSON string from `at` (just past its opening quote): its value so far, and the index past its close (-1 if open). */
function readString(source: string, at: number): { value: string; end: number } {
  let value = '';
  let index = at;
  const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
  while (index < source.length) {
    const char = source[index] ?? '';
    if (char === '"') return { value, end: index + 1 };
    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const hex = source.slice(index + 2, index + 6);
        if (hex.length < 4) break;
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }
      value += escapes[next] ?? next;
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }
  return { value, end: -1 };
}

/** The items in a (possibly unfinished) answer, as far as they can be read. */
export function partialItems(source: string): PartialItem[] {
  const items: PartialItem[] = [];
  const key = /"items"\s*:\s*\[/u.exec(source);
  if (key === null) return items;
  let index = key.index + key[0].length;
  const skip = () => {
    while (index < source.length && /[\s,]/u.test(source[index] ?? '')) index += 1;
  };
  for (;;) {
    skip();
    if (source[index] !== '{') return items;
    index += 1;
    const item: PartialItem = { fields: {}, has_text: false, text: '', closed: false };
    items.push(item);
    for (;;) {
      skip();
      if (index >= source.length) return items;
      if (source[index] === '}') {
        item.closed = true;
        index += 1;
        break;
      }
      if (source[index] !== '"') return items;
      const name = readString(source, index + 1);
      if (name.end === -1) return items;
      index = name.end;
      while (index < source.length && /\s/u.test(source[index] ?? '')) index += 1;
      if (source[index] !== ':') return items;
      index += 1;
      while (index < source.length && /\s/u.test(source[index] ?? '')) index += 1;
      if (index >= source.length) return items;
      if (source[index] === '"') {
        const value = readString(source, index + 1);
        if (name.value === 'text') {
          item.has_text = true;
          item.text = value.value;
        } else if (value.end !== -1) item.fields[name.value] = value.value;
        if (value.end === -1) return items;
        index = value.end;
      } else {
        const token = /^[^,}\s]+/u.exec(source.slice(index));
        if (token === null || index + token[0].length >= source.length) return items;
        if (name.value !== 'text') item.fields[name.value] = token[0] === 'null' ? null : token[0];
        index += token[0].length;
      }
    }
  }
}

export interface ItemStart {
  index: number;
  kind: ItemKind;
  speaker: string | null;
  speaker_id: string | null;
  target: string | null;
  manner: string | null;
}
export type ItemEvent =
  | { type: 'item_start'; item: ItemStart }
  | { type: 'item_text'; index: number; delta: string }
  | { type: 'item_end'; index: number; text: string };

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A streaming answer read as it comes. `mode` is 'json' once it opens with `{`, 'text' when the model
 * answered prose instead (the caller falls back to plain deltas). An item in the seat's name ends the
 * stream (`cut`): nothing of it or after it is shown, as with seatCut.
 */
export class ItemStream {
  mode: 'unknown' | 'json' | 'text' = 'unknown';
  cut = false;
  private buffer = '';
  private sent: { started: boolean; length: number; ended: boolean }[] = [];

  constructor(
    private readonly people: readonly { id: string; name: string }[],
    private readonly seatName: string,
  ) {}

  /** The answer so far. */
  get text(): string {
    return this.buffer;
  }

  feed(chunk: string): ItemEvent[] {
    this.buffer += chunk;
    if (this.mode === 'unknown') {
      const first = this.buffer.trimStart()[0];
      if (first === undefined) return [];
      this.mode = first === '{' ? 'json' : 'text';
    }
    if (this.mode !== 'json' || this.cut) return [];
    const events: ItemEvent[] = [];
    for (const [index, item] of partialItems(this.buffer).entries()) {
      const state = (this.sent[index] ??= { started: false, length: 0, ended: false });
      const kind = item.fields.kind;
      if (!state.started) {
        const ready = item.closed || (item.has_text && typeof kind === 'string');
        if (!ready) break;
        if (!(STRUCTURED.kinds as readonly string[]).includes(kind ?? '')) {
          // Not one of ours: skipped, shown as nothing.
          state.started = state.ended = true;
          continue;
        }
        const speaker = kind === 'narrate' ? null : (item.fields.speaker ?? null);
        if (speaker !== null && this.seatName !== '' && same(speaker, this.seatName)) {
          this.cut = true;
          break;
        }
        state.started = true;
        events.push({
          type: 'item_start',
          item: {
            index,
            kind: kind as ItemKind,
            speaker,
            speaker_id: speaker === null ? null : (this.people.find((person) => same(person.name, speaker))?.id ?? null),
            target: item.fields.target ?? null,
            manner: item.fields.manner ?? null,
          },
        });
      }
      if (state.ended) continue;
      if (item.text.length > state.length) {
        events.push({ type: 'item_text', index, delta: item.text.slice(state.length) });
        state.length = item.text.length;
      }
      if (item.closed) {
        state.ended = true;
        events.push({ type: 'item_end', index, text: item.text });
      } else break;
    }
    return events;
  }
}

/** One message to save: a speaker's run of items (speaker_name set when they aren't a person yet). */
export interface Run {
  speaker_id: string | null;
  speaker_name: string | null;
  lines: PlayerLine[];
}

/**
 * The finished items as messages, one per run of the same speaker, cut at the first item in the
 * seat's name; narrate items are the narrator's. A speaker no person matches keeps their name, for
 * the caller to make them a person (ensure_person).
 */
export function structuredRuns(
  items: readonly PartialItem[],
  people: readonly { id: string; name: string }[],
  seatName: string,
  latest = '',
): { runs: Run[]; cut: boolean } {
  const runs: Run[] = [];
  for (const item of items) {
    const kind = item.fields.kind;
    if (!item.closed || !(STRUCTURED.kinds as readonly string[]).includes(kind ?? '')) continue;
    const whole = item.text.trim();
    // A beat that only echoes the person's own latest line is no answer to it (the operator's play-test).
    if (whole === '' || (kind !== 'say' && latest !== '' && echoOf(whole, latest))) continue;
    const said = kind === 'narrate' ? null : (item.fields.speaker ?? '').trim() || null;
    if (said !== null && seatName !== '' && same(said, seatName)) return { runs, cut: true };
    // Narration keeps what happens to the seat and ends at what it would have them do (seatCut).
    const text = said === null && seatName !== '' ? seatCut(whole, seatName).trim() : whole;
    const seatCutHere = text !== whole;
    if (text === '') return { runs, cut: true };
    const person = said === null ? undefined : people.find((one) => same(one.name, said));
    const speakerId = person?.id ?? null;
    const speakerName = said !== null && person === undefined ? said : null;
    // A line aimed at its own speaker (Zephyrex RPG's live test: "Old Hesk (to Old Hesk)") has no target.
    const aimed = (item.fields.target ?? '').trim();
    const targetName = said !== null && aimed !== '' && same(aimed, said) ? '' : aimed;
    const target = targetName === '' ? undefined : people.find((one) => same(one.name, targetName));
    const manner = item.fields.manner ?? null;
    const line: PlayerLine = {
      speaker_id: speakerId,
      kind: said === null ? 'narrate' : (kind as 'say' | 'do'),
      manner:
        kind === 'say'
          ? (PLAYER_LINES.manners as readonly string[]).includes(manner ?? '')
            ? (manner as Manner)
            : 'speak'
          : null,
      target_id: target?.id ?? null,
      target_name: target === undefined && targetName !== '' ? targetName : null,
      text,
    };
    const last = runs.at(-1);
    if (last !== undefined && last.speaker_id === speakerId && last.speaker_name === speakerName) last.lines.push(line);
    else runs.push({ speaker_id: speakerId, speaker_name: speakerName, lines: [line] });
    if (seatCutHere) return { runs, cut: true };
  }
  return { runs, cut: false };
}

/** A run's saved text: the narrator's prose as paragraphs, anyone else's as their structured lines. */
export function runText(run: Run, people: readonly { id: string; name: string }[]): string {
  if (run.speaker_id === null && run.speaker_name === null) return run.lines.map((line) => line.text).join('\n\n');
  const known = run.speaker_id === null ? [...people, { id: '', name: run.speaker_name ?? '' }] : people;
  return formatPlayerLines(
    run.lines.map((line) => ({ ...line, speaker_id: run.speaker_id ?? '' })),
    known,
  );
}

/**
 * The items that tell something new (the operator, 2026-11-22: "Lots of repetition"): an item that
 * replays the story so far (voiceGuard.ts replayOf; a line said word for word) is dropped before save.
 */
export function freshItems(items: readonly PartialItem[], earlier: readonly string[]): PartialItem[] {
  return items.filter((item) => replayOf(item.fields.kind === 'say' ? `"${item.text}"` : item.text, earlier) === null);
}
