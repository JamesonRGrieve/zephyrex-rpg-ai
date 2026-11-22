// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Asking the person's decision model (the endpoint serving the `decide` role): the questions over a
 * scene go in one chat completion (features/decide), and only answers among the caller's options
 * come back. With no decision model, or one that can't be reached or answers badly, the result is
 * null and the caller does what it did before (a prompt to the chat's own model).
 */
import { type DecideAnswer, type DecideQuestion, decideRequest, readAnswers } from '~/features/decide/decide';
import { endpoints } from '~/lib/rpgRecords';
import { storedExtraBody, withExtraBody } from '~/features/models/extraBody';

const NO_QUERY = new URLSearchParams();

/** A decision model answers in about a second; past this, the caller falls back. */
const DECIDE_TIMEOUT_MS = 8000;
/** The pauses before a second and a third try (the operator, 2026-11-22: "Give the decision model 3 tries"). */
const DECIDE_RETRY_MS = [300, 600] as const;

interface DeciderRow {
  baseUrl: string;
  model: string;
  apiKey: string;
  isDefault: boolean;
  name: string;
  /** Extra request fields (a JSON column), merged into the question's request. */
  extraBody?: string;
}

/** The person's model serving `decide` (the default one first), or null when there is none. */
export async function decider(ownerId: string): Promise<DeciderRow | null> {
  const rows = (await endpoints.list(ownerId, NO_QUERY)).filter((row) =>
    (endpoints.fields(row).roles as string[]).includes('decide'),
  ) as unknown as DeciderRow[];
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows.find((row) => row.isDefault) ?? rows[0] ?? null;
}

/** A chat completion's first message content, or null when the body isn't one. */
export function completionContent(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}

/** The questions' answers from the decision model, or null when it couldn't be asked. */
export async function askDecider(
  row: DeciderRow,
  state: string,
  questions: Readonly<Record<string, DecideQuestion>>,
  signal?: AbortSignal,
): Promise<Record<string, DecideAnswer | null> | null> {
  let answers: Record<string, DecideAnswer | null> | null = null;
  for (let attempt = 0; attempt <= DECIDE_RETRY_MS.length; attempt += 1) {
    answers = await askOnce(row, state, questions, signal);
    if (answers !== null && Object.values(answers).some((value) => value !== null)) return answers;
    if (signal?.aborted === true) return answers;
    const pause = DECIDE_RETRY_MS[attempt];
    if (pause !== undefined) await new Promise((resolve) => setTimeout(resolve, pause));
  }
  // The last try's answer: nothing usable in it (each question null), or null when it couldn't be asked.
  return answers;
}

/** One ask of the decision model: its answers, or null when it couldn't be asked or read. */
async function askOnce(
  row: DeciderRow,
  state: string,
  questions: Readonly<Record<string, DecideQuestion>>,
  signal?: AbortSignal,
): Promise<Record<string, DecideAnswer | null> | null> {
  const timeout = AbortSignal.timeout(DECIDE_TIMEOUT_MS);
  const answer = await fetch(`${row.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
    },
    body: JSON.stringify(withExtraBody(decideRequest(row.model, state, questions), storedExtraBody(row.extraBody))),
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  }).catch(() => null);
  if (answer === null || !answer.ok) return null;
  const content = completionContent(await answer.json().catch(() => null));
  return content === null ? null : readAnswers(questions, content);
}
