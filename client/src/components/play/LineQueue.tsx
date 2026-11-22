// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The person's turn, queued (the operator, 2026-11-21): Say (typed straight into the quotes, with to
 * whom) or Do (typed after the character's name), as many as they like, sent as one message of
 * structured lines (docs/DESIGN.md, Structured lines). As the GM, each item also names who speaks:
 * any character, or the narrator.
 */
import { ArrowDown, ArrowUp, MessageSquareQuote, MessagesSquare, Send, Sparkles, X } from 'lucide-react';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { TargetPicker } from './TargetPicker';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { cn } from '~/lib/utils';

export interface QueueMember {
  id: string;
  name: string;
}

export type QueuedLine =
  | { kind: 'say'; speakerId: string | null; targetId: string | null; targetName?: string; manner?: Manner; text: string }
  | { kind: 'do'; speakerId: string | null; targetId?: string | null; targetName?: string; text: string }
  | { kind: 'ooc'; speakerId: null; text: string };

/** How a line is said (the operator, 2026-11-21), chosen per Say item. */
export type Manner = string;
/** What anyone may do with their voice; the rest come from the setting and the speaker (speech_options). */
export const BASE_MANNERS: SpeechManner[] = [
  { id: 'speak', label: 'says', reaches: 'present' },
  { id: 'whisper', label: 'whispers', reaches: 'present' },
  { id: 'shout', label: 'shouts', reaches: 'present' },
];

/** A way of speaking and how far it carries (the operator, 2026-11-22: setting-dependent modes). */
export interface SpeechManner {
  id: string;
  label: string;
  reaches: 'present' | 'remote' | 'broadcast';
}

/**
 * Who a line can be aimed at (the operator, 2026-11-22: "only allow valid targets (largely present
 * people, or known individuals with vox units / public vox) and should also allow custom entry"):
 * those present, those a remote manner reaches, and any name typed.
 */
export interface SpeechOptions {
  manners: readonly SpeechManner[];
  remote: readonly (QueueMember & { via: string })[];
}

/** The narrator, as a speaker the GM may pick. */
export const NARRATOR_NAME = 'Narrator';
const EVERYONE = 'everyone';

/**
 * The queue as one message, one line per item: `Name (to Target): "words"`, `Name does …`,
 * `Narrator: …` (the format the prompt reads and the story renders).
 */
export function formatLines(lines: readonly QueuedLine[], names: ReadonlyMap<string, string>): string {
  return lines
    .filter((line) => line.kind !== 'ooc' && line.text.trim() !== '')
    .map((line) => {
      const speaker = line.speakerId === null ? NARRATOR_NAME : (names.get(line.speakerId) ?? NARRATOR_NAME);
      const text = line.text.trim();
      if (speaker === NARRATOR_NAME) return `${NARRATOR_NAME}: ${text}`;
      if (line.kind !== 'say') {
        // An action's target, when the person names one (the operator, 2026-11-21: a punch at "it"
        // was read as one at a team mate): `Name (at Target) action…`.
        const at =
          line.kind === 'do'
            ? line.targetId != null
              ? names.get(line.targetId)
              : line.targetName?.trim() || undefined
            : undefined;
        return `${speaker}${at === undefined ? '' : ` (at ${at})`} ${text.replace(/^\s*[*]+|[*]+\s*$/g, '')}`;
      }
      const target = line.targetId !== null ? (names.get(line.targetId) ?? EVERYONE) : line.targetName?.trim() || EVERYONE;
      const words = text.replace(/^["“]|["”]$/g, '');
      const manner = line.manner ?? 'speak';
      const tag =
        manner === 'speak'
          ? `to ${target}`
          : manner === 'whisper' || manner === 'shout'
            ? `to ${target}, ${manner}s`
            : manner === 'voxcast' || target === EVERYONE
              ? manner
              : // A remote manner (vox, the Message spell…): `vox to X`, `message to X`.
                `${manner} to ${target}`;
      return `${speaker} (${tag}): "${words}"`;
    })
    .join('\n');
}

export function LineQueue({
  me,
  speakers,
  present,
  disabled,
  onSend,
  onOutOfGame,
  tools = null,
  onDraft,
  options,
}: {
  /** The seat's character: every item is theirs. Null for the GM, who picks a speaker per item. */
  me: QueueMember | null;
  /** Who the GM may speak as (any character); the narrator is always offered. */
  speakers: readonly QueueMember[];
  /** Who can be spoken to: the characters present. */
  present: readonly QueueMember[];
  disabled: boolean;
  onSend: (text: string) => void;
  /** Out of game (the operator, 2026-11-21): the player to the GM, never the story. */
  onOutOfGame?: (text: string) => void;
  /** Further buttons beside Say and Do (Narrate what happens next). */
  tools?: ReactNode;
  /** The story lines as they stand, for checks while typing (canon warnings). */
  onDraft?: (lines: string) => void;
  /** The speaker's ways of speaking and remote listeners (speech_options); the base three without. */
  options?: SpeechOptions;
}): ReactElement {
  const [held, setQueue] = useState<QueuedLine[]>([]);
  // A character's seat speaks only as that character: an item made a moment before the seat changed
  // (the local UI check, 2026-11-22: a Say item stayed the narrator's after the seat became Gus) is theirs.
  const meId = me?.id ?? null;
  const queue: QueuedLine[] =
    meId === null
      ? held
      : held.map((line) => (line.kind !== 'ooc' && line.speakerId === null ? { ...line, speakerId: meId } : line));
  const remote = options?.remote ?? [];
  const manners = options?.manners.length ? options.manners : BASE_MANNERS;
  const names = new Map([...speakers, ...present, ...remote, ...(me === null ? [] : [me])].map((one) => [one.id, one.name]));

  const add = (kind: 'say' | 'do' | 'ooc') =>
    setQueue((now) => [
      ...now,
      kind === 'say'
        ? { kind, speakerId: me?.id ?? null, targetId: null, text: '' }
        : kind === 'ooc'
          ? { kind, speakerId: null, text: '' }
          : { kind, speakerId: me?.id ?? null, text: '' },
    ]);
  const change = (index: number, patch: Partial<QueuedLine>) =>
    setQueue((now) => now.map((line, at) => (at === index ? ({ ...line, ...patch } as QueuedLine) : line)));
  const move = (index: number, by: number) =>
    setQueue((now) => {
      const next = [...now];
      const [line] = next.splice(index, 1);
      if (line !== undefined) next.splice(Math.max(0, Math.min(next.length, index + by)), 0, line);
      return next;
    });
  const message = formatLines(queue, names);
  useEffect(() => onDraft?.(message), [message, onDraft]);
  const outOfGame = queue.filter((line) => line.kind === 'ooc' && line.text.trim() !== '').map((line) => line.text.trim());
  const send = () => {
    if (message === '' && outOfGame.length === 0) return;
    if (message !== '') onSend(message);
    for (const text of outOfGame) onOutOfGame?.(text);
    setQueue([]);
  };
  const speakerName = (line: QueuedLine) =>
    line.speakerId === null ? (me === null ? NARRATOR_NAME : me.name) : (names.get(line.speakerId) ?? NARRATOR_NAME);

  return (
    <div className='grid gap-2'>
      {queue.length > 0 && (
        <ol aria-label='Queued lines' className='grid gap-2'>
          {queue.map((line, index) => (
            // Queued lines have no identity beyond their place in the queue.
            <li key={index} className='grid gap-1 rounded-lg border p-2'>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                {line.kind === 'ooc' ? (
                  <span className='font-medium text-amber-700 dark:text-amber-300'>You, out of game, to the GM</span>
                ) : me === null ? (
                  <select
                    aria-label='Who speaks'
                    className='h-9 rounded-md border bg-background px-2'
                    value={line.speakerId ?? ''}
                    onChange={(event) => change(index, { speakerId: event.target.value === '' ? null : event.target.value })}
                  >
                    <option value=''>{NARRATOR_NAME}</option>
                    {speakers.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className='font-medium'>{me.name}</span>
                )}
                {line.kind === 'say' && line.speakerId !== null && (
                  <select
                    aria-label='How'
                    className='h-9 rounded-md border bg-background px-2'
                    value={line.manner ?? 'speak'}
                    onChange={(event) => change(index, { manner: event.target.value })}
                  >
                    {manners.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.label}
                      </option>
                    ))}
                  </select>
                )}
                {line.kind === 'do' && line.speakerId !== null && (
                  <TargetPicker
                    label='At whom'
                    prefix='at'
                    none='no one'
                    options={present.filter((one) => one.id !== line.speakerId)}
                    value={{ id: line.targetId ?? null, name: line.targetName ?? '' }}
                    onChange={(next) => change(index, { targetId: next.id, targetName: next.name })}
                  />
                )}
                {line.kind === 'say' &&
                  line.speakerId !== null &&
                  manners.find((one) => one.id === (line.manner ?? 'speak'))?.reaches !== 'broadcast' && (
                    <TargetPicker
                      label='To whom'
                      prefix='to'
                      none='everyone'
                      // Those present for a voice that carries in the room; those it reaches for one that doesn't.
                      options={
                        manners.find((one) => one.id === (line.manner ?? 'speak'))?.reaches === 'remote'
                          ? remote
                          : present.filter((one) => one.id !== line.speakerId)
                      }
                      value={{ id: line.targetId, name: line.targetName ?? '' }}
                      onChange={(next) => change(index, { targetId: next.id, targetName: next.name })}
                    />
                  )}
                <span className='ml-auto flex gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-9'
                    aria-label='Move up'
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className='size-4' aria-hidden />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-9'
                    aria-label='Move down'
                    disabled={index === queue.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className='size-4' aria-hidden />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-9'
                    aria-label='Remove'
                    onClick={() => setQueue((now) => now.filter((_, at) => at !== index))}
                  >
                    <X className='size-4' aria-hidden />
                  </Button>
                </span>
              </div>
              <div
                className={cn('flex items-center gap-1', line.kind === 'say' && line.speakerId !== null && 'font-medium')}
              >
                {line.kind === 'say' && line.speakerId !== null && <span aria-hidden>“</span>}
                {line.kind === 'do' && line.speakerId !== null && (
                  <span className='shrink-0 italic text-muted-foreground'>{speakerName(line)}</span>
                )}
                <Input
                  aria-label={line.kind === 'say' ? 'What is said' : line.kind === 'ooc' ? 'Out of game' : 'What is done'}
                  className={cn('h-11', line.kind === 'do' && 'italic')}
                  // An action follows the name mid-sentence ("Tessaly bangs on…"): no capital.
                  autoCapitalize={line.kind === 'do' && line.speakerId !== null ? 'off' : 'sentences'}
                  placeholder={
                    line.kind === 'ooc'
                      ? 'A question or note for the GM'
                      : line.speakerId === null
                        ? 'What happens'
                        : line.kind === 'say'
                          ? 'Words'
                          : 'bangs on the wall.'
                  }
                  value={line.text}
                  // The newest item takes the cursor as it opens.
                  autoFocus={index === queue.length - 1}
                  onChange={(event) => change(index, { text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
                  }}
                />
                {line.kind === 'say' && line.speakerId !== null && <span aria-hidden>”</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {/* One row, Send at its right end, never a second row (the operator, 2026-11-22: "the send/stop
          button is to the lower right of the text field instead of to the right"). */}
      <div className='flex items-center gap-1.5'>
        <Button type='button' variant='outline' className='h-11 px-2.5' onClick={() => add('say')}>
          <MessageSquareQuote className='size-4' aria-hidden /> Say
        </Button>
        <Button type='button' variant='outline' className='h-11 px-2.5' onClick={() => add('do')}>
          <Sparkles className='size-4' aria-hidden /> Do
        </Button>
        {onOutOfGame !== undefined && (
          <Button type='button' variant='outline' className='h-11 min-w-0 px-2.5' onClick={() => add('ooc')}>
            <MessagesSquare className='size-4' aria-hidden /> Out of game
          </Button>
        )}
        {tools}
        <Button
          type='button'
          className='ml-auto h-11 shrink-0 px-3'
          aria-label={`Send${queue.length > 1 ? ` (${queue.length})` : ''}`}
          disabled={disabled || (message === '' && outOfGame.length === 0)}
          onClick={send}
        >
          <Send className='size-4' aria-hidden />
          <span className='max-sm:sr-only'>Send{queue.length > 1 ? ` (${queue.length})` : ''}</span>
        </Button>
      </div>
    </div>
  );
}
