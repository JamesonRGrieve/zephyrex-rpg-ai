// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every action of a present person is an action line, in present tense, with them as its subject: by
 * construction, never left to a model (the operator, 2026-11-24: "She rose from her seat without proper
 * tense/phrasing and without an action block."). The lite twin of the server's ActionLines.py, held to the
 * same contract/action-cases.json.
 *
 * After the formatter: a narration sentence whose subject is a present person (by name, or a subject pronoun
 * meaning the nearest one named before it) becomes that person's action line; an action line's own subject
 * is taken off (the stored form puts the actor's name first) and its first verb put in the present.
 */
import { ACTION_LINES } from '~/contract';

export interface ActionPerson {
  id: string;
  name: string;
  aliases?: readonly string[] | null;
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

const SENTENCE = /(?<=[.!?])\s+(?=["“(A-Z])/;
const VOWELS = 'aeiou';
const IRREGULAR: Readonly<Record<string, string>> = ACTION_LINES.irregular;
const TITLES: readonly string[] = ACTION_LINES.titles;
const PRONOUNS: readonly string[] = ACTION_LINES.subject_pronouns;
const WORLD_OPENERS: readonly string[] = ACTION_LINES.world_openers;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sentences = (text: string): string[] => text.split(SENTENCE).filter((one) => one.trim() !== '');

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
 * Whose action a sentence is, and its words after the subject: a present person's name (whole, first name or
 * alias) opening it, or a subject pronoun meaning `last`; [null, sentence] when neither.
 */
function who(sentence: string, people: readonly ActionPerson[], last: string | null): [string | null, string] {
  const stripped = sentence.trimStart();
  for (const person of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const names = [person.name, ...(person.aliases ?? []), ...shortNames(person.name)]
      .map((one) => one.trim())
      .filter((one) => one !== '');
    for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
      const match = new RegExp(`^${escape(name)}(?:'s)?\\b\\s+([\\s\\S]*)`).exec(stripped);
      if (match !== null && !stripped.slice(name.length).startsWith("'s")) return [person.id, match[1] ?? ''];
    }
  }
  const pronoun = /^(\w+)\s+([\s\S]*)/.exec(stripped);
  if (pronoun !== null && PRONOUNS.includes((pronoun[1] ?? '').toLowerCase()) && last !== null) {
    return [last, pronoun[2] ?? ''];
  }
  return [null, sentence];
}

/** Whether a sentence opens on the world, not a person (contract action_lines.world_openers). */
function opensOnWorld(sentence: string): boolean {
  const first = /^\W*(\w+)/.exec(sentence);
  return first !== null && WORLD_OPENERS.includes((first[1] ?? '').toLowerCase());
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
  let last: string | null = null;
  for (const run of runs) {
    // In a character's own run, "he" or "she" first means that character.
    if (run.speaker_id !== null) last = run.speaker_id;
    const speaker = run.speaker_id;
    for (const line of run.lines) {
      const text = line.text;
      if (line.kind === 'narrate' || speaker === null) {
        for (const sentence of sentences(text)) {
          const [actor, rest] = who(sentence, people, last);
          if (actor === null || !/^\w/.test(rest) || rest.startsWith('"') || rest.startsWith('“')) {
            // In a character's own run, a sentence without a person as subject stays theirs unless it opens
            // on the world ("The ferry bumps...", live run 2026-11-24): then it's narration.
            if (speaker !== null && !opensOnWorld(sentence)) {
              lines.push({ ...line, speaker_id: speaker, text: sentence });
              continue;
            }
            if (speaker !== null) wrong.push(sentence.trim());
            lines.push({ ...line, speaker_id: null, kind: 'narrate', text: sentence });
            last = named(sentence, people) ?? last;
            continue;
          }
          wrong.push(sentence.trim());
          lines.push({ speaker_id: actor, kind: 'do', manner: null, target_id: null, target_name: null, text: action(rest) });
          last = actor;
        }
        continue;
      }
      if (line.kind === 'do') {
        // A sentence of it that opens on the world ("The ferry bumps against the post", live run 2026-11-24, in
        // Old Hesk's own turn) is narration, never the actor's action; the rest stay one action line.
        const parts = sentences(text);
        let own: string[] = [];
        for (const sentence of parts.length > 0 ? parts : [text]) {
          if (opensOnWorld(sentence) && who(sentence, people, null)[0] === null) {
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
      last = speaker;
    }
  }
  return { runs: grouped(lines, names), wrong };
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
  const [actor, rest] = who(text, people, speaker);
  const fixed = action(actor === speaker ? rest : text);
  if (fixed !== text) wrong.push(`${names.get(speaker) ?? ''} ${text}`.trim());
  return { ...line, speaker_id: speaker, text: fixed };
}

/** Lines into runs again: one per stretch of the same speaker (the narrator's sentences one paragraph). */
function grouped(lines: readonly Placed[], names: ReadonlyMap<string, string>): ActionRun[] {
  const runs: ActionRun[] = [];
  for (const { speaker_id: speaker, ...line } of lines) {
    const previousRun = runs.at(-1);
    if (speaker === null && previousRun !== undefined && previousRun.speaker_id === null && previousRun.lines.length > 0) {
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
    runs.push({ speaker_id: speaker, speaker_name: speaker === null ? null : (names.get(speaker) ?? null), lines: [{ ...line }] });
  }
  return runs;
}
