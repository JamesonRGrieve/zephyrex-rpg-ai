// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether a character's action needs a roll, and which (the operator, 2026-11-21; DESIGN's
 * needs_roll): the decision model chooses only among the campaign's system pack's options (the VTT's
 * test_options for the acting character), sheet or no sheet; with no system, no roll at all. The
 * caller rolls it through the VTT, posts the result as a roll line, and the narrator narrates it.
 * Pure, and held to contract/roll-decision-cases.json, which the SaaS server's RollDecision.py runs too.
 */
import { DECIDE_ROLL } from '~/contract';
import type { DecideAnswer, DecideQuestion } from '~/features/decide/decide';

/** The VTT's test_options for a character (the parts a decision reads). */
export interface TestOptions {
  characteristics: readonly { slug: string; name: string }[];
  skills: readonly { slug: string; name: string }[];
  difficulties: readonly { slug: string }[];
  default_difficulty: string;
  has_sheet: boolean;
}

export type RollPick =
  | { kind: 'none' }
  | { kind: 'test'; name: string; difficulty: string; label: string; source: 'system' };

type Option = { kind: 'none' } | { kind: 'test'; name: string; label: string };

/**
 * Whether a line attempts something uncertain (the operator's play-test: "tries to slice the door's
 * cogitator" got no roll): a do line, not speech, with an attempt word in it. No model call.
 */
export function isAttempt(line: string): boolean {
  if (/^[^"“(]*\([^)]*\)\s*:/u.test(line.trim())) return false;
  const words = line.toLowerCase().split(/[^\p{L}']+/u);
  return DECIDE_ROLL.attempt_words.some((word) => words.includes(word));
}

/**
 * The decision model's questions (the roll, and a difficulty under a pack), and what each option picks.
 * An attempt (isAttempt) offers no "no roll": the model picks the test.
 */
export function rollQuestions(
  options: TestOptions | null,
  mode: string,
  actor: string,
  attempt = false,
): { questions: Record<string, DecideQuestion>; picks: Record<string, Option> } {
  const instructions = (
    attempt ? DECIDE_ROLL.attempt : DECIDE_ROLL.instructions[mode === 'mechanical' ? 'mechanical' : 'narrative']
  ).replaceAll('{{actor}}', actor);
  // Mechanics are never a model's (the operator: "Why ... did it roll 2d8 instead of a d20"): only the
  // campaign's system's own tests, sheet or no sheet; with no system, no roll and no question.
  if (options === null) return { questions: {}, picks: {} };
  const picks: Record<string, Option> = attempt ? {} : { [DECIDE_ROLL.none]: { kind: 'none' } };
  for (const option of [...options.characteristics, ...options.skills]) {
    if (!(option.name in picks)) picks[option.name] = { kind: 'test', name: option.slug, label: option.name };
  }
  return {
    questions: {
      roll: { type: 'choice', instructions, criteria: Object.keys(picks) },
      difficulty: {
        type: 'choice',
        instructions: DECIDE_ROLL.difficulty,
        criteria: options.difficulties.map((difficulty) => difficulty.slug),
      },
    },
    picks,
  };
}

/** What the answers pick, or null when the roll question named no option. */
export function rollPick(
  answers: Readonly<Record<string, DecideAnswer | null | undefined>> | null | undefined,
  picks: Readonly<Record<string, Option>>,
  options: TestOptions | null,
): RollPick | null {
  const answer = answers?.roll;
  if (answer === undefined || answer === null || !('choice' in answer)) return null;
  const option = picks[answer.choice];
  if (option === undefined) return null;
  if (option.kind === 'none') return { kind: 'none' };
  const asked = answers?.difficulty;
  const slugs = (options?.difficulties ?? []).map((difficulty) => difficulty.slug);
  const difficulty =
    asked !== undefined && asked !== null && 'choice' in asked && slugs.includes(asked.choice)
      ? asked.choice
      : (options?.default_difficulty ?? '');
  return { kind: 'test', name: option.name, difficulty, label: `${option.label} (${difficulty})`, source: 'system' };
}

/** The light dice style's outcome for a total (e.g. 2d6: 10+ full success, 7–9 partial, else a miss). */
export function lightOutcome(total: number): string {
  return DECIDE_ROLL.light.bands.find((band) => total >= band.at_least)?.outcome ?? '';
}
