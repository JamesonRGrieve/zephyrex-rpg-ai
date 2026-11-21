// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Canon warnings (docs/DESIGN.md, Canon warnings; the operator, 2026-11-21). A line, a player's
 * or the GM's, is checked against the canon in reach by the decision model:
 * - **yellow**: it likely contravenes established canon (the campaign's facts, its lore, earlier
 *   sessions) or the setting's, though not flagrantly;
 * - **red**: it flagrantly disregards in-universe canon, what any character there would know
 *   (a tech-priest not knowing the Omnissiah).
 * The warning names the fact it conflicts with, quoted, when the model points to one. Notices are
 * table information and never enter the story.
 *
 * Pure: the questions and the verdict. Twinned by server/extensions/ai_chat/Canon.py, both held to
 * contract/canon-cases.json.
 */
import cases from '../../../../contract/canon-cases.json';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';

export interface CanonFact {
  /** Its name (a lore entry's label, "Truth", "Session 1"…). */
  title: string;
  text: string;
}

export type CanonLevel = 'none' | 'yellow' | 'red';

export interface CanonVerdict {
  level: CanonLevel;
  /** The fact it conflicts with, when the model named one. */
  fact: string | null;
  /** One sentence for the person: why it was flagged. */
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

/** The notice from the answers: red for a flagrant break, yellow for a likely contradiction, else none. */
export function canonVerdict(
  answers: Readonly<Record<string, DecideAnswer | null>>,
  facts: readonly CanonFact[],
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
  if (verdict === 'none') return { level: 'none', fact: null, reason: '' };
  const quoted =
    fact === null
      ? ''
      : ` ${fact.title}: “${fact.text
          .trim()
          .split(/(?<=[.!?])\s/)[0]
          ?.slice(0, cases.quote_characters)}”`;
  return {
    level: verdict,
    fact: fact?.title ?? null,
    reason: (verdict === 'red' ? cases.red_reason : cases.yellow_reason) + quoted,
  };
}
