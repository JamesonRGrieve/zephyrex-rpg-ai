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
  FileText,
  Footprints,
  Languages,
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
  questions: { key: string; type: string; instructions: string }[];
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
      <dl className='grid gap-2'>
        {call.questions.map((question) => (
          <div key={question.key} className='grid gap-1 rounded-md border p-2'>
            <dt className='font-medium'>{question.instructions || question.key}</dt>
            <dd>
              <pre className='overflow-x-auto text-xs whitespace-pre-wrap'>
                {call.answers !== null && question.key in call.answers ? exact(call.answers[question.key]) : 'No answer'}
              </pre>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DecisionCalls({ calls }: { calls: readonly DecisionCall[] }): ReactElement | null {
  const drawer = useDrawer();
  if (calls.length === 0) return null;
  const ordered = [...calls].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <ul aria-label='Decision calls' className='flex flex-wrap gap-1 pb-1'>
      {ordered.map((call) => {
        const Icon = call.state === 'running' ? LoaderCircle : iconOf(call.purpose);
        const bad = failed(call);
        const label = `${call.purpose}${bad ? ', failed' : ''}`;
        return (
          <li key={call.id}>
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
