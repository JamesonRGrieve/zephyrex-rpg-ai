// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The person's turn, queued (the operator, 2026-11-21): Say (typed straight into the quotes, with to
 * whom) or Do (typed after the character's name), as many as they like, sent as one message of
 * structured lines (docs/DESIGN.md, Structured lines). As the GM, each item also names who speaks:
 * any character, or the narrator.
 */
import { ArrowDown, ArrowUp, MessageSquareQuote, Send, Sparkles, X } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { cn } from '~/lib/utils';

export interface QueueMember {
  id: string;
  name: string;
}

export type QueuedLine =
  | { kind: 'say'; speakerId: string | null; targetId: string | null; text: string }
  | { kind: 'do'; speakerId: string | null; text: string };

/** The narrator, as a speaker the GM may pick. */
export const NARRATOR_NAME = 'Narrator';
const EVERYONE = 'everyone';

/**
 * The queue as one message, one line per item: `Name (to Target): "words"`, `Name does …`,
 * `Narrator: …` (the format the prompt reads and the story renders).
 */
export function formatLines(lines: readonly QueuedLine[], names: ReadonlyMap<string, string>): string {
  return lines
    .filter((line) => line.text.trim() !== '')
    .map((line) => {
      const speaker = line.speakerId === null ? NARRATOR_NAME : (names.get(line.speakerId) ?? NARRATOR_NAME);
      const text = line.text.trim();
      if (speaker === NARRATOR_NAME) return `${NARRATOR_NAME}: ${text}`;
      if (line.kind === 'do') return `${speaker} ${text.replace(/^\s*[*]+|[*]+\s*$/g, '')}`;
      const target = line.targetId === null ? EVERYONE : (names.get(line.targetId) ?? EVERYONE);
      return `${speaker} (to ${target}): "${text.replace(/^["“]|["”]$/g, '')}"`;
    })
    .join('\n');
}

export function LineQueue({
  me,
  speakers,
  present,
  disabled,
  onSend,
}: {
  /** The seat's character: every item is theirs. Null for the GM, who picks a speaker per item. */
  me: QueueMember | null;
  /** Who the GM may speak as (any character); the narrator is always offered. */
  speakers: readonly QueueMember[];
  /** Who can be spoken to: the characters present. */
  present: readonly QueueMember[];
  disabled: boolean;
  onSend: (text: string) => void;
}): ReactElement {
  const [queue, setQueue] = useState<QueuedLine[]>([]);
  const names = new Map([...speakers, ...present, ...(me === null ? [] : [me])].map((one) => [one.id, one.name]));
  const add = (kind: 'say' | 'do') =>
    setQueue((now) => [
      ...now,
      kind === 'say'
        ? { kind, speakerId: me?.id ?? null, targetId: null, text: '' }
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
  const send = () => {
    if (message === '') return;
    onSend(message);
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
                {me === null ? (
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
                    aria-label='To whom'
                    className='h-9 rounded-md border bg-background px-2'
                    value={line.targetId ?? ''}
                    onChange={(event) => change(index, { targetId: event.target.value === '' ? null : event.target.value })}
                  >
                    <option value=''>to everyone</option>
                    {present
                      .filter((one) => one.id !== line.speakerId)
                      .map((one) => (
                        <option key={one.id} value={one.id}>
                          to {one.name}
                        </option>
                      ))}
                  </select>
                )}
                <span className='ml-auto flex gap-1'>
                  <Button type='button' variant='ghost' size='icon' className='size-9' aria-label='Move up' disabled={index === 0} onClick={() => move(index, -1)}>
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
              <div className={cn('flex items-center gap-1', line.kind === 'say' && line.speakerId !== null && 'font-medium')}>
                {line.kind === 'say' && line.speakerId !== null && <span aria-hidden>“</span>}
                {line.kind === 'do' && line.speakerId !== null && (
                  <span className='shrink-0 italic text-muted-foreground'>{speakerName(line)}</span>
                )}
                <Input
                  aria-label={line.kind === 'say' ? 'What is said' : 'What is done'}
                  className={cn('h-11', line.kind === 'do' && 'italic')}
                  placeholder={
                    line.speakerId === null ? 'What happens' : line.kind === 'say' ? 'Words' : 'bangs on the wall.'
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
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' className='h-11' onClick={() => add('say')}>
          <MessageSquareQuote className='size-4' aria-hidden /> Say
        </Button>
        <Button type='button' variant='outline' className='h-11' onClick={() => add('do')}>
          <Sparkles className='size-4' aria-hidden /> Do
        </Button>
        <Button type='button' className='ml-auto h-11' disabled={disabled || message === ''} onClick={send}>
          <Send className='size-4' aria-hidden /> Send{queue.length > 1 ? ` (${queue.length})` : ''}
        </Button>
      </div>
    </div>
  );
}
