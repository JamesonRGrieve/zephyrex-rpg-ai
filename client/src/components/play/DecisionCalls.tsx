// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The decision models' calls, one icon each under the message they followed, stacking left to right in the
 * order they were made, and kept (the operator, 2026-11-24: "Each decision model call should be an icon under
 * the prior message, stacking up left to right. Each icon should be able to be clicked to see what question
 * was asked and what the exact results were. Each question should have a hard coded different icon to go with
 * it. A fail should be red, with a retry stacking up beside it"). A retry is its own call, so it stands beside
 * the failure it retried.
 */
import {
  Activity,
  BookCheck,
  CircleQuestionMark,
  Clock,
  Crosshair,
  Dices,
  Drama,
  FileText,
  Footprints,
  HeartHandshake,
  Languages,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  type LucideIcon,
  MapPin,
  ScrollText,
  ShieldHalf,
  Sparkles,
  Sword,
  Swords,
  Tags,
  UserPlus,
  UserSearch,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '~/lib/utils';
import { useDrawer } from './CanonNotice';

export interface DecisionCall {
  id: string;
  purpose: string;
  questions: { key: string; type: string; instructions: string; options: string[] }[];
  /** Which try this was (a retry is its own call); 1 when the server didn't say. */
  attempt: number;
  /** running, done, failed. */
  state: string;
  answers: Record<string, unknown> | null;
  /** Why it failed ({kind, detail}), as the server recorded it; null when it didn't. */
  error: Record<string, unknown> | null;
  model: string | null;
  ms: number | null;
  createdAt: string;
}

/** Each kind of question's own icon (hard coded, one per purpose the server records). */
const ICONS: Record<string, LucideIcon> = {
  next_turn: Users,
  label_lines: Tags,
  'map_step: scene': Footprints,
  map_step: MapPin,
  'Combat: start': Swords,
  'Combat: sides': ShieldHalf,
  'Combat: disposition': HeartHandshake,
  'Combat: turn': Crosshair,
  "Combat: person's turn": Sword,
  clarify: CircleQuestionMark,
  npc_needed: UserPlus,
  npc_match: UserSearch,
  npc_sheet: ScrollText,
  needs_roll: Dices,
  builder_pick: WandSparkles,
  canon: BookCheck,
  summary: FileText,
  translate: Languages,
  status_line: Activity,
  world_tick: Clock,
  learned_facts: Lightbulb,
  expression: Drama,
  format_check: ListChecks,
};

/** The icon for a call's question; one shared by no known purpose for anything new. */
export function iconOf(purpose: string): LucideIcon {
  return ICONS[purpose] ?? Sparkles;
}

/** A call failed: the server recorded why, or the model gave no usable answer to any question. */
export function failed(call: Pick<DecisionCall, 'state' | 'error' | 'answers'>): boolean {
  if (call.state === 'running') return false;
  if (call.state === 'failed' || call.error !== null) return true;
  return call.answers === null || Object.values(call.answers).every((one) => one === null);
}

/** One option a question offered, its score (the decider's probability for it) when recorded, and whether
 * it was the one chosen. */
export interface OptionScore {
  option: string;
  score: number | null;
  chosen: boolean;
}

const optionName = (one: unknown): string | null => {
  if (typeof one === 'string') return one;
  for (const key of ['option', 'value', 'label', 'name']) {
    const value = Reflect.get(Object(one), key);
    if (typeof value === 'string') return value;
  }
  return null;
};

/** Every option a question offered, with its score where the server kept one (the operator, 2026-11-24:
 * "I don't see the available options and their individual scores"), the chosen one marked, best first. */
export function optionScores(question: DecisionCall['questions'][number], answer: unknown): OptionScore[] {
  const chosen = optionName(Reflect.get(Object(answer), 'choice')) ?? (typeof answer === 'string' ? answer : null);
  const probability = Reflect.get(Object(answer), 'probability');
  const scores = new Map<string, number>();
  const kept = Reflect.get(Object(answer), 'scores');
  if (kept !== null && typeof kept === 'object' && !Array.isArray(kept)) {
    for (const [option, score] of Object.entries(kept)) if (typeof score === 'number') scores.set(option, score);
  }
  for (const listed of [Reflect.get(Object(answer), 'options'), Reflect.get(Object(answer), 'scores')]) {
    if (!Array.isArray(listed)) continue;
    for (const one of listed) {
      const name = optionName(one);
      const score = Reflect.get(Object(one), 'score') ?? Reflect.get(Object(one), 'probability');
      if (name !== null && typeof score === 'number') scores.set(name, score);
    }
  }
  if (chosen !== null && !scores.has(chosen) && typeof probability === 'number') scores.set(chosen, probability);
  const names = [...question.options, ...scores.keys(), ...(chosen === null ? [] : [chosen])];
  return [...new Set(names)]
    .map((option) => ({ option, score: scores.get(option) ?? null, chosen: option === chosen }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** A decision call from the server's row; null when it is not one. */
export function readDecisionCall(row: unknown): (DecisionCall & { messageId: string | null }) | null {
  const at = (key: string) => Reflect.get(Object(row), key);
  const id = at('id');
  const purpose = at('purpose');
  if (typeof id !== 'string' || typeof purpose !== 'string') return null;
  const questions = Array.isArray(at('questions')) ? (at('questions') as unknown[]) : [];
  const answers = at('answers');
  const error = at('error');
  const messageId = at('message_id');
  const createdAt = at('created_at');
  return {
    id,
    purpose,
    messageId: typeof messageId === 'string' ? messageId : null,
    questions: questions.flatMap((one) => {
      const key = Reflect.get(Object(one), 'key');
      const type = Reflect.get(Object(one), 'type');
      const instructions = Reflect.get(Object(one), 'instructions');
      // A list of options, or the criteria offered as {option: meaning}.
      const offered = Reflect.get(Object(one), 'options') ?? Reflect.get(Object(one), 'choices');
      const options =
        offered !== null && typeof offered === 'object' && !Array.isArray(offered) ? Object.keys(offered) : offered;
      return typeof key === 'string'
        ? [
            {
              key,
              type: typeof type === 'string' ? type : '',
              instructions: typeof instructions === 'string' ? instructions : '',
              options: Array.isArray(options) ? options.flatMap((option) => optionName(option) ?? []) : [],
            },
          ]
        : [];
    }),
    attempt: typeof at('attempt') === 'number' ? (at('attempt') as number) : 1,
    // The server's `status` (each try's own row, written while it runs), or the older `state`.
    state: typeof at('status') === 'string' ? (at('status') as string) : typeof at('state') === 'string' ? (at('state') as string) : 'done',
    answers: answers !== null && typeof answers === 'object' ? (answers as Record<string, unknown>) : null,
    error: error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : null,
    model: typeof at('model') === 'string' ? (at('model') as string) : null,
    ms: typeof at('ms') === 'number' ? (at('ms') as number) : null,
    createdAt: typeof createdAt === 'string' ? createdAt : '',
  };
}

const exact = (value: unknown) => JSON.stringify(value, null, 2);

function CallDetail({ call }: { call: DecisionCall }): ReactElement {
  return (
    <div className='grid gap-3 p-4 text-sm'>
      <p className={cn('text-muted-foreground', failed(call) && 'text-destructive')}>
        {call.model ?? 'Model not recorded'}
        {call.ms !== null && ` · ${(call.ms / 1000).toFixed(1)} s`} · {failed(call) ? 'failed' : call.state}
      </p>
      {call.error !== null && (
        <pre className='overflow-x-auto rounded-md border border-destructive p-2 text-xs whitespace-pre-wrap text-destructive'>
          {exact(call.error)}
        </pre>
      )}
      <dl className='grid gap-3'>
        {call.questions.map((question) => {
          const answer = call.answers?.[question.key];
          const scored = optionScores(question, answer);
          return (
            <div key={question.key} className='grid gap-2 rounded-md border p-3'>
              <dt className='font-medium'>{question.instructions || question.key}</dt>
              <dd className='grid gap-2'>
                {scored.length === 0 ? (
                  <p className='text-muted-foreground'>No answer</p>
                ) : (
                  <ol aria-label='Options and scores' className='grid gap-1'>
                    {scored.map((one) => (
                      <li
                        key={one.option}
                        className={cn(
                          'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded px-2 py-1',
                          one.chosen && 'bg-primary/10 font-medium',
                        )}
                      >
                        <span>
                          {one.option}
                          {one.chosen && <span className='sr-only'> (chosen)</span>}
                        </span>
                        <span className='text-xs tabular-nums text-muted-foreground'>
                          {one.score === null ? 'not scored' : `${(one.score * 100).toFixed(1)}%`}
                        </span>
                        {one.score !== null && (
                          <span aria-hidden className='col-span-2 h-1 rounded bg-muted'>
                            <span
                              className={cn('block h-1 rounded', one.chosen ? 'bg-primary' : 'bg-muted-foreground/40')}
                              style={{ width: `${Math.max(2, one.score * 100)}%` }}
                            />
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <details className='text-xs'>
                  <summary className='cursor-pointer text-muted-foreground'>Exact answer</summary>
                  <pre className='mt-1 overflow-x-auto whitespace-pre-wrap'>{answer === undefined ? 'None' : exact(answer)}</pre>
                </details>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function DecisionCalls({ calls }: { calls: readonly DecisionCall[] }): ReactElement | null {
  const drawer = useDrawer();
  if (calls.length === 0) return null;
  const ordered = [...calls].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <ul aria-label='Decision calls' className='mt-2 mb-1 flex flex-wrap gap-1.5'>
      {ordered.map((call) => {
        const Icon = call.state === 'running' ? LoaderCircle : iconOf(call.purpose);
        const bad = failed(call);
        const label = `${call.purpose}${call.attempt > 1 ? `, try ${call.attempt}` : ''}${bad ? ', failed' : ''}`;
        return (
          // Each slides in from the side as it arrives (the operator, 2026-11-24).
          <li
            key={call.id}
            className='animate-in fade-in slide-in-from-left-4 duration-300 motion-reduce:animate-none'
          >
            <button
              type='button'
              aria-label={label}
              title={label}
              className={cn(
                'flex size-8 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground',
                bad && 'border-destructive text-destructive hover:text-destructive',
              )}
              disabled={drawer === null}
              onClick={() => drawer?.open(<CallDetail call={call} />, label)}
            >
              <Icon
                aria-hidden
                className={cn('size-4', call.state === 'running' && 'animate-spin motion-reduce:animate-none')}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
