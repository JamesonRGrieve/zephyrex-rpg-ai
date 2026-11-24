// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every action of a present person is an action line, in present tense, with them as its subject: by
 * construction, never left to a model (the operator, 2026-11-24: "She rose from her seat without proper
 * tense/phrasing and without an action block."). The lite twin of the server's ActionLines.py, held to the
 * same contract/action-cases.json.
 *
 * After the formatter: a narration sentence whose subject is a present person (by name, or a subject pronoun
 * meaning the nearest one named before it) becomes that person's action line; an action line's own subject
 * is taken off (the stored form puts the actor's name first) and its first verb put in the present. A sentence
 * opening on a present person's possessive ("Delphine Halloway's spine stiffens", "Her gaze sweeps across the
 * room") is their action too, kept as `'s spine stiffens` (stored `Delphine Halloway's spine stiffens`):
 * build60's live run, 2026-11-24, "she set down her cup and it wasn't action tagged". A pronoun means the
 * nearest person named whose own pronoun doesn't say otherwise.
 */
import { ACTION_LINES } from '~/contract';
import { formatPlayerLines } from './playerLines';

export interface ActionPerson {
  id: string;
  name: string;
  aliases?: readonly string[] | null;
  /** Their own pronoun (he, she, they), when it's known. */
  pronoun?: string | null;
  /** What's said of them: its pronouns give theirs when `pronoun` doesn't. */
  description?: string | null;
  summary?: string | null;
}

export interface ActionLine {
  kind: 'say' | 'do' | 'narrate';
  manner: string | null;
  target_id: string | null;
  target_name: string | null;
  text: string;
}

export interface ActionRun {
  speaker_id: string | null;
  speaker_name: string | null;
  lines: ActionLine[];
}

type Placed = ActionLine & { speaker_id: string | null };

// A sentence ends at . ! or ?, or one with a closing quote after it, before the next one opens.
const BOUNDARY = /(?<=[.!?]["”]?)\s+(?=["“(A-Z])/g;
const QUOTED = /["“]([^"”]*)["”]?/g;
const VOWELS = 'aeiou';
// A screen block (`[screen: Title]` ... `[/screen]`) is shown as written, a line of it each (build60's live run,
// 2026-11-24, chat d219ba90: the Watch Report's lines split into sentences and joined into one paragraph).
const SCREEN_OPEN = /\[screen(?::[^\]\n]*)?\]/i;
const SCREEN_OPEN_ALL = /\[screen(?::[^\]\n]*)?\]/gi;
const SCREEN_CLOSE = /\[\/screen\]/i;
const IRREGULAR: Readonly<Record<string, string>> = ACTION_LINES.irregular;
const TITLES: readonly string[] = ACTION_LINES.titles;
const PRONOUNS: readonly string[] = ACTION_LINES.subject_pronouns;
const WORLD_OPENERS: readonly string[] = ACTION_LINES.world_openers;
const POSSESSIVE_OPENERS: Readonly<Record<string, string>> = ACTION_LINES.possessive_openers;
const PRONOUN_WORDS: Readonly<Record<string, readonly string[]>> = ACTION_LINES.pronoun_words;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * A text's sentences, never split inside quoted speech (live run, build58: Hesk's "...what they owe. That
 * miller's got himself into..." split at "That", a world opener, and half his speech went to the narrator).
 */
export function sentences(text: string): string[] {
  const found: string[] = [];
  let start = 0;
  for (const boundary of text.matchAll(BOUNDARY)) {
    const head = text.slice(0, boundary.index);
    const straight = head.split('"').length - 1;
    if (straight % 2 === 1 || head.split('“').length > head.split('”').length) continue;
    found.push(text.slice(start, boundary.index));
    start = boundary.index + boundary[0].length;
  }
  found.push(text.slice(start));
  return found.filter((one) => one.trim() !== '');
}

/**
 * A narrator text's pieces in order, each [on a screen, text]: its prose, and a screen block's lines one each,
 * its tags each a line of their own; and whether a block is still open at its end (the formatter gives a block
 * one item per line).
 */
export function screenApart(text: string, open = false): [Array<[boolean, string]>, boolean] {
  const pieces: Array<[boolean, string]> = [];
  let rest = text;
  let inside = open;
  while (rest.trim() !== '') {
    if (inside) {
      const close = SCREEN_CLOSE.exec(rest);
      const body = (close === null ? rest : rest.slice(0, close.index)).replace(SCREEN_OPEN_ALL, (tag) => `${tag}\n`);
      for (const one of body.split('\n')) if (one.trim() !== '') pieces.push([true, one.trim()]);
      if (close === null) return [pieces, true];
      pieces.push([true, close[0]]);
      inside = false;
      rest = rest.slice(close.index + close[0].length);
      continue;
    }
    const found = SCREEN_OPEN.exec(rest);
    if (found === null) {
      pieces.push([false, rest.trim()]);
      break;
    }
    if (rest.slice(0, found.index).trim() !== '') pieces.push([false, rest.slice(0, found.index).trim()]);
    inside = true;
    rest = rest.slice(found.index);
  }
  return [pieces, inside];
}

/**
 * A past-tense verb in the present, third person ("rose" rises, "walked" walks, "nodded" nods); a verb
 * already in the present, or not a verb it knows, as it is.
 */
export function present(verb: string): string {
  const word = verb.toLowerCase();
  let found: string;
  if (Object.hasOwn(IRREGULAR, word)) {
    found = IRREGULAR[word] ?? word;
  } else if (word.length > 3 && word.endsWith('ied')) {
    found = `${word.slice(0, -3)}ies`;
  } else if (word.length > 3 && word.endsWith('ed')) {
    let base = word.slice(0, -2);
    const last = base.at(-1) ?? '';
    if (base.length > 2 && last === base.at(-2) && !`ls${VOWELS}`.includes(last)) {
      base = base.slice(0, -1); // nodded: nod
    } else if (syllables(base) === 1 && cvc(base)) {
      base += 'e'; // smiled: smile; hoped: hope
    }
    found = base + (['s', 'sh', 'ch', 'x', 'z', 'o'].some((end) => base.endsWith(end)) ? 'es' : 's');
  } else {
    return verb;
  }
  const first = verb.slice(0, 1);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase()
    ? found.slice(0, 1).toUpperCase() + found.slice(1)
    : found;
}

function syllables(word: string): number {
  return (word.match(/[aeiouy]+/g) ?? []).length;
}

function cvc(word: string): boolean {
  const [a, b, c] = [word.at(-3) ?? '', word.at(-2) ?? '', word.at(-1) ?? ''];
  return word.length >= 3 && !`${VOWELS}wxy`.includes(c) && VOWELS.includes(b) && !VOWELS.includes(a);
}

/**
 * What a person may be called besides their whole name: their first name and their last, never a title
 * ("Old Hesk" is Hesk, never Old; "Inspector Mira Kettle" is Mira or Kettle).
 */
export function shortNames(name: string): string[] {
  const all = name.split(/\s+/).filter((word) => word !== '');
  if (all.length <= 1) return [];
  const words = all.filter((word) => !TITLES.includes(word.toLowerCase()));
  return [...new Set([...words.slice(0, 1), ...words.slice(-1)])];
}

/**
 * A person's own pronoun: the one they carry (`pronoun`), else the one their description uses most (contract
 * action_lines.pronoun_words); null when neither says.
 */
export function pronounOf(person: ActionPerson | undefined): string | null {
  if (person === undefined) return null;
  if (person.pronoun != null && PRONOUNS.includes(person.pronoun)) return person.pronoun;
  const words = (person.description ?? person.summary ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
  const ranked = Object.entries(PRONOUN_WORDS)
    .map(([pronoun, forms]): [string, number] => [pronoun, words.filter((word) => forms.includes(word)).length])
    .sort((a, b) => b[1] - a[1]);
  const [top, next] = ranked;
  if (top === undefined || top[1] === 0 || (next !== undefined && next[1] === top[1])) return null;
  return top[0];
}

/**
 * Who a pronoun means: the nearest of `recent` (most recent last) whose own pronoun is it, or unknown (never
 * when `strict`: "their" is a group's unless the person is "they"); null when no one fits ("Her knuckles"
 * after Bram Holloway's action is no action of his).
 */
export function antecedent(
  pronoun: string,
  recent: readonly string[],
  people: readonly ActionPerson[],
  strict = false,
): string | null {
  for (const id of [...recent].reverse()) {
    const theirs = pronounOf(people.find((one) => one.id === id));
    if (theirs === pronoun || (theirs === null && !strict)) return id;
  }
  return null;
}

/**
 * Whose action a sentence is, its words after the subject, and whether the subject is a possessive: a present
 * person's name (whole, first name or alias) opening it, or a pronoun meaning one of `recent` (antecedent). A
 * possessive's words keep it ("'s spine stiffens"). [null, sentence, false] when neither.
 */
function who(
  sentence: string,
  people: readonly ActionPerson[],
  recent: readonly string[],
): [string | null, string, boolean] {
  const stripped = sentence.trimStart();
  for (const person of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const names = [person.name, ...(person.aliases ?? []), ...shortNames(person.name)]
      .map((one) => one.trim())
      .filter((one) => one !== '');
    for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
      const match = new RegExp(`^${escape(name)}(['’]s\\b)?\\s+([\\s\\S]*)`, 'u').exec(stripped);
      if (match !== null) {
        const owned = match[1] !== undefined;
        return [person.id, owned ? `'s ${match[2] ?? ''}` : (match[2] ?? ''), owned];
      }
    }
  }
  const first = /^(\w+)\s+([\s\S]*)/.exec(stripped);
  const word = (first?.[1] ?? '').toLowerCase();
  if (first !== null && PRONOUNS.includes(word)) {
    const found = antecedent(word, recent, people);
    if (found !== null) return [found, first[2] ?? '', false];
  }
  const owner = Object.hasOwn(POSSESSIVE_OPENERS, word) ? POSSESSIVE_OPENERS[word] : undefined;
  if (first !== null && owner !== undefined) {
    const found = antecedent(owner, recent, people, word === 'their');
    if (found !== null) return [found, `'s ${first[2] ?? ''}`, true];
  }
  return [null, sentence, false];
}

/** Whether a sentence opens on the world, not a person (contract action_lines.world_openers). */
function opensOnWorld(sentence: string): boolean {
  const first = /^\W*(\w+)/.exec(sentence);
  return first !== null && WORLD_OPENERS.includes((first[1] ?? '').toLowerCase());
}

/**
 * Whether a sentence opens on a possessive ("Old Hesk's weathered face tightens", "His gaze lingers..."): asked
 * only when no one present it could mean was found (who), when it is narration.
 */
function possessed(sentence: string, people: readonly ActionPerson[]): boolean {
  const stripped = sentence.trimStart();
  const first = /^\W*(\w+)/.exec(stripped);
  if (first !== null && Object.hasOwn(POSSESSIVE_OPENERS, (first[1] ?? '').toLowerCase())) return true;
  return people.some((person) =>
    [person.name, ...shortNames(person.name), ...(person.aliases ?? [])].some(
      (name) => name.trim() !== '' && stripped.startsWith(`${name.trim()}'s`),
    ),
  );
}

/**
 * A character's own sentence with no person as its subject, as their lines: a quote-led one is their speech,
 * and a tag after it with them as subject ("...," he mutters) their action; null when it opens on the world
 * or a possessive of no one present (narration). Their plain words are their speech, as their plain reply is: never
 * "Narrator:" in their own message (live run, build58).
 */
function ownWords(line: ActionLine, sentence: string, speaker: string, people: readonly ActionPerson[]): Placed[] | null {
  if (opensOnWorld(sentence) || possessed(sentence, people)) return null;
  const said: Placed = { ...line, speaker_id: speaker, kind: 'say', manner: line.manner ?? null, text: '' };
  if (!sentence.trimStart().startsWith('"') && !sentence.trimStart().startsWith('“')) {
    return [{ ...said, text: sentence.trim() }];
  }
  const quoted = [...sentence.matchAll(QUOTED)]
    .map((part) => (part[1] ?? '').trim())
    .filter((part) => part !== '')
    .join(' ')
    .replace(/[,;: ]+$/, '');
  const tail = sentence.replace(QUOTED, '').replace(/^[ ,;:]+|[ ,;:]+$/g, '');
  const lines: Placed[] = quoted === '' ? [] : [{ ...said, text: quoted }];
  if (tail === '') return lines;
  const [actor, rest, owned] = who(tail, people, [speaker]);
  if (actor !== speaker || !/^[\w']/.test(rest)) return null;
  return [
    ...lines,
    {
      speaker_id: speaker,
      kind: 'do',
      manner: null,
      target_id: null,
      target_name: null,
      text: owned ? rest : action(rest),
    },
  ];
}

/** An action's words with its first verb in the present: "rose from her seat." rises from her seat. */
function action(rest: string): string {
  const first = /^(\w+)([\s\S]*)/.exec(rest);
  return first === null ? rest : `${present(first[1] ?? '')}${first[2] ?? ''}`;
}

/** The last present person a text names, or null. */
function named(text: string, people: readonly ActionPerson[]): string | null {
  let at = -1;
  let found: string | null = null;
  for (const person of people) {
    for (const name of [person.name, ...shortNames(person.name), ...(person.aliases ?? [])]) {
      for (const match of text.matchAll(new RegExp(`\\b${escape(name)}\\b`, 'g'))) {
        if (match.index > at) {
          at = match.index;
          found = person.id;
        }
      }
    }
  }
  return found;
}

/**
 * The runs with every present person's action an action line of theirs, in present tense, and the sentences
 * that weren't (for the formatter's second try). Speech is left as it is.
 */
export function actionLines(
  runs: readonly ActionRun[],
  people: readonly ActionPerson[],
): { runs: ActionRun[]; wrong: string[] } {
  const names = new Map(people.map((one) => [one.id, one.name]));
  const lines: Placed[] = [];
  const wrong: string[] = [];
  // Who a pronoun may mean, the most recent last.
  const recent: string[] = [];
  // Which lines are a screen block's, and whether one is open.
  const screen = new Set<number>();
  let onScreen = false;
  for (const run of runs) {
    // In a character's own run, "he" or "she" first means that character.
    if (run.speaker_id !== null) recent.push(run.speaker_id);
    const speaker = run.speaker_id;
    for (const line of run.lines) {
      const text = line.text;
      if (line.kind === 'narrate' || speaker === null) {
        const [pieces, open] = screenApart(text, onScreen);
        onScreen = open;
        for (const [shown, piece] of pieces) {
          if (shown) {
            // A screen's line is the narrator's, as written.
            screen.add(lines.length);
            lines.push({ ...line, speaker_id: null, kind: 'narrate', text: piece });
            continue;
          }
          for (const sentence of sentences(piece)) {
            const [actor, rest, owned] = who(sentence, people, recent);
            if (actor === null || !(owned || /^\w/.test(rest)) || rest.startsWith('"') || rest.startsWith('“')) {
              // In a character's own run, a sentence without a person as subject is their words unless it opens
              // on the world ("The ferry bumps...", live run 2026-11-24) or a possessive: then it's narration.
              const own = speaker === null ? null : ownWords(line, sentence, speaker, people);
              if (own !== null) {
                lines.push(...own);
                continue;
              }
              if (speaker !== null) wrong.push(sentence.trim());
              lines.push({ ...line, speaker_id: null, kind: 'narrate', text: sentence });
              const mentioned = named(sentence, people);
              if (mentioned !== null) recent.push(mentioned);
              continue;
            }
            wrong.push(sentence.trim());
            lines.push({
              speaker_id: actor,
              kind: 'do',
              manner: null,
              target_id: null,
              target_name: null,
              text: owned ? rest : action(rest),
            });
            recent.push(actor);
          }
        }
        continue;
      }
      if (line.kind === 'do') {
        // A sentence of it that opens on the world ("The ferry bumps against the post", live run 2026-11-24, in
        // Old Hesk's own turn) is narration, never the actor's action; the rest stay one action line.
        const parts = sentences(text);
        let own: string[] = [];
        for (const sentence of parts.length > 0 ? parts : [text]) {
          const [actor, rest, owned] = who(sentence, people, [...recent, speaker]);
          if (owned && actor !== null) {
            // "Old Hesk's weathered face tightens" in his own turn: his action, as Old Hesk's ...
            if (own.length > 0) {
              lines.push(ownLine(line, speaker, own.join(' '), people, names, wrong));
              own = [];
            }
            wrong.push(`${names.get(speaker) ?? ''} ${sentence}`.trim());
            lines.push({ ...line, speaker_id: actor, kind: 'do', text: rest });
            continue;
          }
          if ((opensOnWorld(sentence) && actor === null) || possessed(sentence, people)) {
            if (own.length > 0) {
              lines.push(ownLine(line, speaker, own.join(' '), people, names, wrong));
              own = [];
            }
            wrong.push(`${names.get(speaker) ?? ''} ${sentence}`.trim());
            lines.push({ ...line, speaker_id: null, kind: 'narrate', text: sentence });
          } else {
            own.push(sentence);
          }
        }
        if (own.length > 0) lines.push(ownLine(line, speaker, own.join(' '), people, names, wrong));
      } else {
        lines.push({ ...line, speaker_id: speaker });
      }
      recent.push(speaker);
    }
  }
  return { runs: grouped(lines, names, screen), wrong };
}

/** An action line of the speaker's, its own subject taken off and its first verb in the present. */
function ownLine(
  line: ActionLine,
  speaker: string,
  text: string,
  people: readonly ActionPerson[],
  names: ReadonlyMap<string, string>,
  wrong: string[],
): Placed {
  const [actor, rest] = who(text, people, [speaker]);
  const fixed = action(actor === speaker ? rest : text);
  if (fixed !== text) wrong.push(`${names.get(speaker) ?? ''} ${text}`.trim());
  return { ...line, speaker_id: speaker, text: fixed };
}

/** Lines into runs again: one per stretch of the same speaker (the narrator's sentences one paragraph). */
function grouped(lines: readonly Placed[], names: ReadonlyMap<string, string>, screen: ReadonlySet<number>): ActionRun[] {
  const runs: ActionRun[] = [];
  for (const [at, { speaker_id: speaker, ...line }] of lines.entries()) {
    const previousRun = runs.at(-1);
    // A screen block's lines are each their own.
    const joins = !screen.has(at) && !screen.has(at - 1);
    if (
      joins &&
      speaker === null &&
      previousRun !== undefined &&
      previousRun.speaker_id === null &&
      previousRun.lines.length > 0
    ) {
      const previous = previousRun.lines[previousRun.lines.length - 1];
      if (previous !== undefined) {
        previousRun.lines[previousRun.lines.length - 1] = { ...previous, text: `${previous.text} ${line.text}`.trim() };
      }
      continue;
    }
    if (previousRun !== undefined && previousRun.speaker_id === speaker) {
      previousRun.lines.push({ ...line });
      continue;
    }
    runs.push({
      speaker_id: speaker,
      speaker_name: speaker === null ? null : (names.get(speaker) ?? null),
      lines: [{ ...line }],
    });
  }
  return runs;
}

export interface SavedPart {
  speaker_id: string | null;
  speaker_name?: string | null;
  text: string;
}

/**
 * The parts a narration is saved as (the reader's split, lib's narrateSegments), with every present person's
 * action in the narrator's parts made their action line, as the server's credited_runs saves them: a
 * speaker's own part is kept as written; an action found in the narration is that person's line ("Old Hesk
 * shifts his weight", live run 2026-11-24). With multi-actor turns off (`solo`) the narrator voices no one,
 * so an action found is cut, never saved as narration (d3c8288).
 */
export function actedParts(parts: readonly SavedPart[], people: readonly ActionPerson[], solo = false): SavedPart[] {
  const known = new Set(people.map((person) => person.id));
  const narrator = (part: SavedPart): boolean => part.speaker_id === null && (part.speaker_name ?? '') === '';
  const out: SavedPart[] = [];
  let context: ActionRun | null = null;
  for (const part of parts) {
    if (!narrator(part)) {
      out.push(part);
      // The speaker a following "she" means: a person of the scene's.
      if (part.speaker_id !== null && known.has(part.speaker_id)) {
        const line: ActionLine = { kind: 'say', manner: null, target_id: null, target_name: null, text: part.text };
        context = { speaker_id: part.speaker_id, speaker_name: null, lines: [line] };
      }
      continue;
    }
    const told: ActionRun = {
      speaker_id: null,
      speaker_name: null,
      lines: [{ kind: 'narrate', manner: null, target_id: null, target_name: null, text: part.text }],
    };
    const { runs: acted } = actionLines(context === null ? [told] : [context, told], people);
    // The context's own line goes; an action of the same speaker's grouped after it stays.
    const runs =
      context === null
        ? acted
        : acted
            .map((run, index) => (index === 0 ? { ...run, lines: run.lines.slice(1) } : run))
            .filter((run) => run.lines.length > 0);
    for (const run of runs) {
      if (run.speaker_id === null) {
        const text = run.lines.map((line) => line.text).join(' ');
        if (text.trim() !== '') out.push({ speaker_id: null, text });
        continue;
      }
      if (solo) continue;
      out.push({
        speaker_id: run.speaker_id,
        text: formatPlayerLines(
          run.lines.map((line) => ({
            speaker_id: run.speaker_id ?? '',
            kind: line.kind,
            manner: null,
            target_id: line.target_id,
            target_name: line.target_name,
            text: line.text,
          })),
          people,
        ),
      });
      const line = run.lines.at(-1);
      if (line !== undefined) context = { speaker_id: run.speaker_id, speaker_name: null, lines: [line] };
    }
  }
  return out;
}
