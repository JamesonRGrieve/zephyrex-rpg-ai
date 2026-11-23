// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The decision models' calls about a message, stacked side by side under it and kept (the operator,
 * 2026-11-23: "decision model calls… should stack up horizontally under the previous message and persist").
 * Each chip names what was decided; a tap opens the questions, the answers, the model and the time in the
 * bottom drawer.
 */
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { useDrawer } from './CanonNotice';

export interface DecisionCall {
  id: string;
  purpose: string;
  questions: { key: string; type: string; instructions: string }[];
  /** running, done, failed. */
  state: string;
  answers: Record<string, unknown> | null;
  model: string | null;
  ms: number | null;
}

/** A decision call from the server's row; null when it is not one. */
export function readDecisionCall(row: unknown): (DecisionCall & { messageId: string | null }) | null {
  const at = (key: string) => Reflect.get(Object(row), key);
  const id = at('id');
  const purpose = at('purpose');
  if (typeof id !== 'string' || typeof purpose !== 'string') return null;
  const questions = Array.isArray(at('questions')) ? (at('questions') as unknown[]) : [];
  const answers = at('answers');
  const messageId = at('message_id');
  return {
    id,
    purpose,
    messageId: typeof messageId === 'string' ? messageId : null,
    questions: questions.flatMap((one) => {
      const key = Reflect.get(Object(one), 'key');
      const type = Reflect.get(Object(one), 'type');
      const instructions = Reflect.get(Object(one), 'instructions');
      return typeof key === 'string'
        ? [
            {
              key,
              type: typeof type === 'string' ? type : '',
              instructions: typeof instructions === 'string' ? instructions : '',
            },
          ]
        : [];
    }),
    state: typeof at('state') === 'string' ? (at('state') as string) : 'done',
    answers: answers !== null && typeof answers === 'object' ? (answers as Record<string, unknown>) : null,
    model: typeof at('model') === 'string' ? (at('model') as string) : null,
    ms: typeof at('ms') === 'number' ? (at('ms') as number) : null,
  };
}

const said = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

function CallDetail({ call }: { call: DecisionCall }): ReactElement {
  return (
    <div className='grid gap-3 p-4 text-sm'>
      <p className='text-muted-foreground'>
        {call.model ?? 'Model not recorded'}
        {call.ms !== null && ` · ${(call.ms / 1000).toFixed(1)} s`} · {call.state}
      </p>
      <dl className='grid gap-2'>
        {call.questions.map((question) => (
          <div key={question.key} className='grid gap-0.5 rounded-md border p-2'>
            <dt className='font-medium'>{question.instructions || question.key}</dt>
            <dd>{call.answers !== null && question.key in call.answers ? said(call.answers[question.key]) : 'No answer'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DecisionCalls({ calls }: { calls: readonly DecisionCall[] }): ReactElement | null {
  const drawer = useDrawer();
  if (calls.length === 0) return null;
  return (
    <ul aria-label='Decision calls' className='flex gap-1.5 overflow-x-auto pb-1'>
      {calls.map((call) => (
        <li key={call.id} className='shrink-0'>
          <button
            type='button'
            className='flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs text-muted-foreground hover:text-foreground'
            disabled={drawer === null}
            onClick={() => drawer?.open(<CallDetail call={call} />, call.purpose)}
          >
            {call.state === 'running' ? (
              <LoaderCircle aria-hidden className='size-3.5 animate-spin motion-reduce:animate-none' />
            ) : call.state === 'failed' ? (
              <CircleAlert aria-hidden className='size-3.5 text-destructive' />
            ) : (
              <Check aria-hidden className='size-3.5' />
            )}
            {call.purpose}
          </button>
        </li>
      ))}
    </ul>
  );
}
