// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The decide role's protocol (a calibrated decision model, e.g. Self Hosted AI's d1-2b): a chat
 * completion whose last user message is `{state, questions}`, answered with `{answers}`. Who speaks
 * next, which lore fits, which expression, a typed choice in a fight: each is a question over the
 * scene, asked together in one call. A decision model only ever chooses among the options the
 * caller supplies, so an answer outside them is refused (null), never used.
 *
 * Held to contract/decide-cases.json with the server's twin (ai_chat/Decide.py).
 */

export type DecideQuestion =
  | { type: 'choice'; instructions: string; criteria: readonly string[] | Readonly<Record<string, string>> }
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; criteria: readonly string[] };

export type DecideAnswer =
  { choice: string; probability?: number } | { probability: number } | { level: string; index: number };

type WireQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; criteria: string[] };

/** The options of a choice, as the protocol sends them: name → description ("" when none). */
function choiceOptions(criteria: readonly string[] | Readonly<Record<string, string>>): Record<string, string> {
  return Array.isArray(criteria)
    ? Object.fromEntries((criteria as readonly string[]).map((name) => [name, '']))
    : { ...(criteria as Readonly<Record<string, string>>) };
}

function wire(question: DecideQuestion): WireQuestion {
  switch (question.type) {
    case 'choice':
      return { type: 'choice', instructions: question.instructions, criteria: choiceOptions(question.criteria) };
    case 'noul':
      return { type: 'noul', instructions: question.instructions };
    case 'score':
      return { type: 'score', instructions: question.instructions, criteria: [...question.criteria] };
  }
}

/** The last user message's object: the scene, and each question in the protocol's shape. */
export function decideMessage(
  state: string,
  questions: Readonly<Record<string, DecideQuestion>>,
): { state: string; questions: Record<string, WireQuestion> } {
  return {
    state,
    questions: Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, wire(question)])),
  };
}

/** A chat-completions body asking `model` the questions over `state`. */
export function decideRequest(
  model: string,
  state: string,
  questions: Readonly<Record<string, DecideQuestion>>,
): Record<string, unknown> {
  return {
    model,
    messages: [{ role: 'user', content: JSON.stringify(decideMessage(state, questions)) }],
    response_format: { type: 'json_object' },
    stream: false,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function readOne(question: DecideQuestion, raw: unknown): DecideAnswer | null {
  if (!isRecord(raw) || raw.type !== question.type) return null;
  switch (question.type) {
    case 'choice': {
      const options = Object.keys(choiceOptions(question.criteria));
      const choice = raw.choice;
      if (typeof choice !== 'string' || !options.includes(choice)) return null;
      const probabilities = isRecord(raw.probabilities) ? raw.probabilities : {};
      const probability = probabilities[choice];
      return isProbability(probability) ? { choice, probability } : { choice };
    }
    case 'noul':
      return isProbability(raw.noul) ? { probability: raw.noul } : null;
    case 'score': {
      const level = raw.score;
      // The level by its name, or (as d1-2b answers) by its index into the criteria.
      const index =
        typeof level === 'number' && Number.isInteger(level) && level >= 0 && level < question.criteria.length
          ? level
          : typeof level === 'string'
            ? question.criteria.indexOf(level)
            : -1;
      return index >= 0 ? { level: question.criteria[index] as string, index } : null;
    }
  }
}

/** Each question's answer from the reply's content; null where it is missing, malformed or outside the options. */
export function readAnswers(
  questions: Readonly<Record<string, DecideQuestion>>,
  content: string,
): Record<string, DecideAnswer | null> {
  let answers: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed) && isRecord(parsed.answers)) answers = parsed.answers;
  } catch {
    answers = {};
  }
  return Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, readOne(question, answers[key])]));
}

/** The estimate the budget is counted in: about four characters to a token. */
export const tokensOf = (characters: number): number => Math.ceil(characters / 4);

/**
 * Questions split into requests that each stay within `budget` tokens (the state repeats in each):
 * in order, a question that would cross the budget starts the next request; one too large on its
 * own still goes, alone. Returns the questions' indexes per request.
 */
export function batchQuestions(stateCharacters: number, questionCharacters: readonly number[], budget: number): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let used = tokensOf(stateCharacters);
  questionCharacters.forEach((characters, index) => {
    const cost = tokensOf(characters);
    if (current.length > 0 && used + cost > budget) {
      batches.push(current);
      current = [];
      used = tokensOf(stateCharacters);
    }
    current.push(index);
    used += cost;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}
