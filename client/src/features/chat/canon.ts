// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Canon warnings (docs/DESIGN.md, Canon warnings; the operator, 2026-11-21). A line, a player's
 * or the GM's, is checked against the canon in reach by the decision model:
 * - **yellow**: it likely contravenes established canon (the campaign's facts, its lore, earlier
 *   sessions) or the setting's, though not flagrantly;
 * - **red**: it flagrantly disregards in-universe canon, what any character there would know
 *   (a tech-priest not knowing the Omnissiah).
 * The notice says WHY (the operator, 2026-11-22: "Canon check has no detail. Just 'may differ from the
 * scenario'. I need WHY!"): the summary model says what specifically differs, against the fact in its
 * record's own words; a flag it can't make specific is no notice. Notices are table information and
 * never enter the story.
 *
 * Pure: the questions and the verdict. Twinned by server/extensions/ai_chat/Canon.py, both held to
 * contract/canon-cases.json.
 */
import cases from '../../../../contract/canon-cases.json';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';
import { REASONING } from '~/contract';
import { splitReasoning } from '~/features/prompt/assemble';

export interface CanonFact {
  /** Its name (a wiki record's or lore entry's name, "Truth", "Session 1"…). */
  title: string;
  text: string;
  /** The wiki record's id, when the fact is one. */
  id?: string;
}

export type CanonLevel = 'none' | 'yellow' | 'red';

export interface CanonVerdict {
  level: CanonLevel;
  /** The fact in its record's own words (its name and the sentence nearest the line), when one was named. */
  fact: string | null;
  /** The wiki record the fact is, when it is one. */
  record_name: string | null;
  record_id: string | null;
}

export interface CanonNotice extends CanonVerdict {
  /** What specifically differs, in one sentence. */
  reason: string;
}

const NONE = cases.none_option;

/** The scene the decision model reads: who speaks, the line, and the canon in reach, numbered. */
export function canonState(speaker: string, line: string, facts: readonly CanonFact[]): string {
  const listed = facts
    .slice(0, cases.max_facts)
    .map((fact, index) => `${index + 1}. ${fact.title}: ${fact.text.trim().slice(0, cases.fact_characters)}`)
    .join('\n');
  return `${cases.setting_heading}\n${listed || cases.no_facts}\n\n${cases.line_heading}\n${speaker}: ${line.trim()}`;
}

/** The questions: established canon, in-universe canon, and which fact it conflicts with. */
export function canonQuestions(facts: readonly CanonFact[]): Record<string, DecideQuestion> {
  const titles = [...new Set(facts.slice(0, cases.max_facts).map((fact) => fact.title))];
  return {
    established: { type: 'score', instructions: cases.questions.established, criteria: cases.established_levels },
    universe: { type: 'score', instructions: cases.questions.universe, criteria: cases.universe_levels },
    fact: { type: 'choice', instructions: cases.questions.fact, criteria: [...titles, NONE] },
  };
}

const words = (text: string): Set<string> => new Set(text.toLowerCase().match(/\w{3,}/gu) ?? []);

/** The fact in its record's own words: its name and the sentence nearest the line (the first on a tie). */
export function factWords(fact: CanonFact, line: string): string {
  const sentences = fact.text
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter((one) => one.trim() !== '');
  const wanted = words(line);
  const shared = (sentence: string) => [...words(sentence)].filter((word) => wanted.has(word)).length;
  const best = sentences.reduce<string | null>((top, one) => (top === null || shared(one) > shared(top) ? one : top), null);
  return `${fact.title}: ${(best ?? '').slice(0, cases.quote_characters)}`;
}

/** The flag from the answers: red for a flagrant break, yellow for a likely contradiction, else none. */
export function canonVerdict(
  answers: Readonly<Record<string, DecideAnswer | null>>,
  facts: readonly CanonFact[],
  line = '',
): CanonVerdict {
  const level = (key: 'established' | 'universe'): number => {
    const answer = answers[key];
    return answer !== null && answer !== undefined && 'index' in answer ? answer.index : 0;
  };
  const chosen = answers.fact;
  const title =
    chosen !== null && chosen !== undefined && 'choice' in chosen && chosen.choice !== NONE ? chosen.choice : null;
  const fact = title === null ? null : (facts.find((one) => one.title === title) ?? null);
  const verdict: CanonLevel =
    level('universe') >= cases.red_at_universe
      ? 'red'
      : level('established') >= cases.yellow_at_established || level('universe') >= cases.yellow_at_universe
        ? 'yellow'
        : 'none';
  if (verdict === 'none') return { level: 'none', fact: null, record_name: null, record_id: null };
  const record = fact !== null && (fact.id ?? '') !== '';
  return {
    level: verdict,
    fact: fact === null ? null : factWords(fact, line),
    record_name: record ? fact.title : null,
    record_id: record ? (fact.id ?? null) : null,
  };
}

/** What the summary model is asked: what specifically the line gets wrong against the fact. */
export function whyMessages(speaker: string, line: string, fact: string | null): { role: string; content: string }[] {
  return [
    { role: 'system', content: cases.why_prompt.replace('{{fact}}', fact ?? cases.why_setting) },
    { role: 'user', content: `${speaker}: ${line.trim()}` },
  ];
}

/** The summary model's sentence, its thinking and quotes taken off; null for NONE or nothing. */
export function readWhy(answer: string): string | null {
  const thinks = REASONING.pairs.some(([opening]) => answer.includes(opening as string));
  const text = (thinks ? splitReasoning(answer).reply : answer)
    .trim()
    .replace(/^["“”']+|["“”']+$/gu, '')
    .trim();
  if (text === '' || text.toUpperCase().startsWith(cases.why_none)) return null;
  return text.slice(0, cases.why_characters);
}

/** The notice: the flag with what specifically differs, or none (never a vague warning). */
export function canonNotice(verdict: CanonVerdict, why: string | null): CanonNotice {
  if (verdict.level === 'none' || why === null)
    return { level: 'none', fact: null, record_name: null, record_id: null, reason: '' };
  return { ...verdict, reason: why };
}
