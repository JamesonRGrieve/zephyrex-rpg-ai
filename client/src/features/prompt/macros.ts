// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SillyTavern's macros (audit gap 1), so imported cards, lorebooks, presets and quick replies read as
 * their authors wrote them. Pure, and held to contract/macro-cases.json, which the SaaS server's
 * Macros.py runs too.
 *
 * Syntax, as SillyTavern's: `{{name}}`, `{{name::arg::arg}}`, and the older `{{name:arg}}` (for
 * random, a comma list); names are case-insensitive; macros nest, the innermost first, left to
 * right; `<BOT>` and `<USER>` are the oldest spellings of char and user. A macro this doesn't know
 * stays as written.
 *
 * Nothing here reads a clock or a random source of its own: the caller passes `now` and `random`,
 * so both twins give the same text for the same context; without them, the time and random
 * macros stay as written. `pick` is stable: the same chat, text and
 * place pick the same item on every regeneration (FNV-1a over them, as UTF-8).
 */

export interface MacroNames {
  char: string;
  user: string;
}

export interface MacroContext {
  names: MacroNames;
  /** The group's members' names, comma-separated; empty outside a group. */
  group?: string;
  /** Everyone in the chat but the character speaking, comma-separated. */
  not_char?: string;
  fields?: Partial<Record<MacroField, string>>;
  chat?: {
    chat_id?: string;
    last_message?: string;
    last_user_message?: string;
    last_char_message?: string;
    last_message_id?: string;
    first_included_message_id?: string;
    input?: string;
    /** Seconds since the person's last line. */
    idle_seconds?: number;
  };
  /** Now, as milliseconds since the epoch, and the person's offset from UTC in minutes. */
  now?: { epoch_ms: number; utc_offset_minutes: number };
  /** A number in [0, 1) for each draw, in order. */
  random?: () => number;
  local?: Readonly<Record<string, string>>;
  global?: Readonly<Record<string, string>>;
}

export type MacroField =
  | 'persona'
  | 'description'
  | 'personality'
  | 'scenario'
  | 'mesExamples'
  | 'charPrompt'
  | 'charInstruction'
  | 'model';

export interface Expanded {
  text: string;
  /** The chat's and the global variables after the text's setvar, addvar, incvar and decvar. */
  local: Record<string, string>;
  global: Record<string, string>;
}

const FIELDS: Record<string, MacroField> = {
  persona: 'persona',
  description: 'description',
  personality: 'personality',
  scenario: 'scenario',
  mesexamples: 'mesExamples',
  charprompt: 'charPrompt',
  charinstruction: 'charInstruction',
  charjailbreak: 'charInstruction',
  model: 'model',
};

const INNERMOST = /\{\{((?:(?!\{\{|\}\})[\s\S])*)\}\}/g;
const KEPT = /\u0000(\d+)\u0000/g;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (value: number) => String(value).padStart(2, '0');

/** The wall-clock parts of `epochMs` at `offsetMinutes` from UTC. */
function partsOf(epochMs: number, offsetMinutes: number) {
  const at = new Date(epochMs + offsetMinutes * 60_000);
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth(),
    day: at.getUTCDate(),
    weekday: at.getUTCDay(),
    hour: at.getUTCHours(),
    minute: at.getUTCMinutes(),
    second: at.getUTCSeconds(),
  };
}

const FORMAT_TOKENS = /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a|\[[^\]]*\]/g;

/** A moment.js-style format (the tokens SillyTavern's datetimeformat uses most). */
export function formatDate(epochMs: number, offsetMinutes: number, format: string): string {
  const p = partsOf(epochMs, offsetMinutes);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const tokens: Record<string, string> = {
    YYYY: String(p.year),
    YY: pad(p.year % 100),
    MMMM: MONTHS[p.month] ?? '',
    MMM: (MONTHS[p.month] ?? '').slice(0, 3),
    MM: pad(p.month + 1),
    M: String(p.month + 1),
    DD: pad(p.day),
    D: String(p.day),
    dddd: DAYS[p.weekday] ?? '',
    ddd: (DAYS[p.weekday] ?? '').slice(0, 3),
    HH: pad(p.hour),
    H: String(p.hour),
    hh: pad(hour12),
    h: String(hour12),
    mm: pad(p.minute),
    ss: pad(p.second),
    A: p.hour < 12 ? 'AM' : 'PM',
    a: p.hour < 12 ? 'am' : 'pm',
  };
  return format.replace(FORMAT_TOKENS, (token) => (token.startsWith('[') ? token.slice(1, -1) : (tokens[token] ?? token)));
}

/** How long ago, as moment.js's humanize says it. */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  const minutes = Math.round(s / 60);
  const hours = Math.round(s / 3600);
  const days = Math.round(s / 86_400);
  if (s < 45) return 'a few seconds';
  if (s < 90) return 'a minute';
  if (minutes < 45) return `${minutes} minutes`;
  if (minutes < 90) return 'an hour';
  if (hours < 22) return `${hours} hours`;
  if (hours < 36) return 'a day';
  if (days < 26) return `${days} days`;
  if (days < 45) return 'a month';
  if (days < 320) return `${Math.round(days / 30.4375)} months`;
  if (days < 548) return 'a year';
  return `${Math.round(days / 365.25)} years`;
}

/** FNV-1a, 32-bit, over UTF-8: the same number in both twins. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const numeric = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));
const numberText = (value: number) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))));

/** `{{roll:2d6+1}}`: the dice summed, each drawn in turn; null for a formula it can't read. */
function roll(formula: string, draw: () => number): string | null {
  const dice = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(formula);
  if (dice !== null) {
    const count = dice[1] === '' || dice[1] === undefined ? 1 : Number(dice[1]);
    const sides = Number(dice[2]);
    if (count < 1 || count > 100 || sides < 1) return null;
    let total = 0;
    for (let index = 0; index < count; index += 1) total += Math.floor(draw() * sides) + 1;
    const bonus = dice[4] === undefined ? 0 : Number(dice[4]) * (dice[3] === '-' ? -1 : 1);
    return String(total + bonus);
  }
  if (/^\s*\d+\s*$/.test(formula)) {
    const sides = Number(formula);
    return sides < 1 ? null : String(Math.floor(draw() * sides) + 1);
  }
  return null;
}

/** A macro's name and its arguments: `name::a::b`, the older `name:a`, or `name a`. */
function parse(body: string): { name: string; args: string[] } {
  const trimmed = body.trim();
  if (trimmed.startsWith('//')) return { name: '//', args: [] };
  if (/^[.$]/.test(trimmed)) return { name: trimmed[0] ?? '', args: [trimmed.slice(1).trim()] };
  const named = /^([A-Za-z_][\w+-]*)/.exec(trimmed);
  if (named === null) return { name: '', args: [] };
  const name = (named[1] ?? '').toLowerCase();
  const rest = trimmed.slice(named[0].length);
  if (rest === '') return { name, args: [] };
  if (rest.startsWith('::')) return { name, args: rest.slice(2).split('::') };
  if (rest.startsWith(':')) return { name, args: [rest.slice(1)] };
  if (/^\s/.test(rest)) return { name, args: [rest.trim()] };
  return { name: '', args: [] };
}

/** The text with every macro it knows filled in; the variables as the text left them. */
export function expandAll(text: string, context: MacroContext): Expanded {
  const local: Record<string, string> = { ...context.local };
  const global: Record<string, string> = { ...context.global };
  const draw = context.random;
  const kept: string[] = [];
  const picks = new Map<string, number>();
  const chat = context.chat ?? {};
  const fields = context.fields ?? {};

  const value = (whole: string, body: string): string | null => {
    const { name, args } = parse(body);
    const first = args[0] ?? '';
    const vars = (global_: boolean) => (global_ ? global : local);
    switch (name) {
      case 'char':
        return context.names.char;
      case 'user':
        return context.names.user;
      case 'group':
        return context.group || context.names.char;
      case 'charifnotgroup':
        return context.group || context.names.char;
      case 'notchar':
        return context.not_char ?? context.names.user;
      case 'lastmessage':
        return chat.last_message ?? '';
      case 'lastusermessage':
        return chat.last_user_message ?? '';
      case 'lastcharmessage':
        return chat.last_char_message ?? '';
      case 'lastmessageid':
        return chat.last_message_id ?? '';
      case 'firstincludedmessageid':
        return chat.first_included_message_id ?? '';
      case 'input':
        return chat.input ?? '';
      case 'idle_duration':
        return chat.idle_seconds === undefined ? null : humanDuration(chat.idle_seconds);
      case 'newline':
        return '\n';
      case 'noop':
      case '//':
        return '';
      case 'trim':
        return '\u0001';
      case 'reverse':
        return Array.from(first).reverse().join('');
      case 'outlet':
        return '';
      case 'random': {
        if (draw === undefined) return null;
        const items = args.length > 1 ? args : first.split(',');
        if (items.length === 0 || first === '') return null;
        return (items[Math.floor(draw() * items.length)] ?? '').trim();
      }
      case 'pick': {
        const items = args.length > 1 ? args : first.split(',');
        if (items.length === 0 || first === '') return null;
        const seen = picks.get(whole) ?? 0;
        picks.set(whole, seen + 1);
        const seed = fnv1a(`${chat.chat_id ?? ''}\u0000${text}\u0000${whole}\u0000${seen}`);
        return (items[seed % items.length] ?? '').trim();
      }
      case 'roll':
        return draw === undefined ? null : roll(first, draw);
      case 'time':
      case 'date':
      case 'weekday':
      case 'isotime':
      case 'isodate': {
        if (context.now === undefined) return null;
        const formats = { time: 'h:mm A', date: 'MMMM D, YYYY', weekday: 'dddd', isotime: 'HH:mm', isodate: 'YYYY-MM-DD' };
        return formatDate(context.now.epoch_ms, context.now.utc_offset_minutes, formats[name]);
      }
      case 'datetimeformat':
        return context.now === undefined ? null : formatDate(context.now.epoch_ms, context.now.utc_offset_minutes, first);
      case '.':
        return local[first] ?? '';
      case '$':
        return global[first] ?? '';
      default:
        break;
    }
    const utc = /^time_utc([+-]\d{1,2})$/.exec(name);
    if (utc !== null) {
      return context.now === undefined ? null : formatDate(context.now.epoch_ms, Number(utc[1]) * 60, 'h:mm A');
    }
    const field = FIELDS[name];
    if (field !== undefined) return fields[field] ?? '';
    const variable = /^(get|set|add|inc|dec)(global)?var$/.exec(name);
    if (variable !== null) {
      const store = vars(variable[2] !== undefined);
      const key = first.trim();
      if (key === '') return null;
      const current = store[key] ?? '';
      switch (variable[1]) {
        case 'get':
          return current;
        case 'set':
          store[key] = args[1] ?? '';
          return '';
        case 'add': {
          const added = args[1] ?? '';
          store[key] = numeric(current || '0') && numeric(added) ? numberText(Number(current || '0') + Number(added)) : current + added;
          return '';
        }
        default:
          store[key] = numberText((Number(current) || 0) + (variable[1] === 'inc' ? 1 : -1));
          return store[key] ?? '';
      }
    }
    return null;
  };

  let current = text.replace(/<BOT>/g, context.names.char).replace(/<USER>/g, context.names.user);
  for (;;) {
    let found = false;
    current = current.replace(INNERMOST, (whole, body: string) => {
      found = true;
      const filled = value(whole, body);
      if (filled !== null) return filled;
      kept.push(whole);
      return `\u0000${kept.length - 1}\u0000`;
    });
    if (!found) break;
  }
  // {{trim}} takes the line breaks around it with it.
  current = current.replace(/[\r\n]*\u0001[\r\n]*/g, '');
  // An unknown macro is put back as written (its inner macros filled in).
  for (let guard = 0; current.includes('\u0000') && guard < 64; guard += 1) {
    current = current.replace(KEPT, (_whole, index: string) => kept[Number(index)] ?? '');
  }
  return { text: current, local, global };
}

/** The names only, as before: `{{char}}`, `{{user}}` and their spellings (and every macro with no context). */
export function expandMacros(text: string, names: MacroNames): string {
  return expandAll(text, { names }).text;
}
