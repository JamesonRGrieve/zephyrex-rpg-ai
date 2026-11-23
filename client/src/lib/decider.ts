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

/**
 * A one-question call is answered in about half a second when the model is free; a request waits for its
 * own size (Zephyrex RPG's measurement, 2026-11-23: 20 label questions took 23.8 to 82.1 s alone, where a
 * flat 8 s expired every one). The server's twin: Decide.py decide_timeout.
 */
const DECIDE_TIMEOUT_MS = 8000;
const DECIDE_MS_PER_QUESTION = 4000;
/** The pauses before a second and a third try (the operator, 2026-11-22: "Give the decision model 3 tries"). */
const DECIDE_RETRY_MS = [300, 600] as const;
/** At most this many requests in flight at once, the rest queued here (Self Hosted AI: d1-2b serves 4 slots). */
const DECIDE_IN_FLIGHT = 4;

/** How long a request may take: a base, and a share for each question it asks. */
export function decideTimeoutMs(questions: Readonly<Record<string, unknown>>): number {
  return DECIDE_TIMEOUT_MS + DECIDE_MS_PER_QUESTION * Object.keys(questions).length;
}

let inFlight = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= DECIDE_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
  try {
    return await work();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

/** Identical requests already in flight: asked once, shared. */
const sharing = new Map<string, Promise<Record<string, DecideAnswer | null> | null>>();

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
  if (signal !== undefined) return askTries(row, state, questions, signal);
  const key = JSON.stringify([row.baseUrl, row.model, state, questions, row.extraBody ?? null]);
  const running = sharing.get(key) ?? askTries(row, state, questions);
  if (!sharing.has(key)) {
    sharing.set(key, running);
    void running.finally(() => sharing.delete(key));
  }
  return running;
}

async function askTries(
  row: DeciderRow,
  state: string,
  questions: Readonly<Record<string, DecideQuestion>>,
  signal?: AbortSignal,
): Promise<Record<string, DecideAnswer | null> | null> {
  let answers: Record<string, DecideAnswer | null> | null = null;
  for (let attempt = 0; attempt <= DECIDE_RETRY_MS.length; attempt += 1) {
    let timedOut = false;
    answers = await slot(() =>
      askOnce(row, state, questions, signal, () => {
        timedOut = true;
      }),
    );
    if (answers !== null && Object.values(answers).some((value) => value !== null)) return answers;
    // A timeout isn't tried again: the model is busy, and another request only lengthens its queue.
    if (signal?.aborted === true || timedOut) return answers;
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
  onTimeout?: () => void,
): Promise<Record<string, DecideAnswer | null> | null> {
  const timeout = AbortSignal.timeout(decideTimeoutMs(questions));
  const answer = await fetch(`${row.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(row.apiKey === '' ? {} : { Authorization: `Bearer ${row.apiKey}` }),
    },
    body: JSON.stringify(withExtraBody(decideRequest(row.model, state, questions), storedExtraBody(row.extraBody))),
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  }).catch(() => {
    if (timeout.aborted) onTimeout?.();
    return null;
  });
  if (answer === null || !answer.ok) return null;
  const content = completionContent(await answer.json().catch(() => null));
  return content === null ? null : readAnswers(questions, content);
}
