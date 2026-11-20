// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Where the person writes. A switch says whether this is the story or table talk, and the box takes
 * `/ooc`, `((…))` and `//` for one message (features/chat/outgoing.ts). Enter sends on a keyboard;
 * on a touch screen Enter is a new line and the send button sends. It stays above the on-screen
 * keyboard and the home indicator.
 */
import { Send, Square } from 'lucide-react';
import { type KeyboardEvent, type ReactElement, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Textarea } from 'zephyrex/ui/textarea';
import { cn } from '~/lib/utils';
import { LIMITS } from '~/contract';
import { type ComposerChannel, outgoing } from '~/features/chat/outgoing';

const CHANNELS: { value: ComposerChannel; label: string }[] = [
  { value: 'ic', label: 'Story' },
  { value: 'ooc', label: 'Table talk' },
];

/** Whether the device's main pointer is coarse (a finger), where Enter should not send. */
function touchFirst(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function Composer({
  writing,
  disabled = false,
  onSend,
  onStop,
}: {
  writing: boolean;
  disabled?: boolean;
  onSend: (text: string, channel: ComposerChannel) => void;
  onStop: () => void;
}): ReactElement {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<ComposerChannel>('ic');
  const boxId = useId();

  const send = () => {
    const message = outgoing(text, channel);
    if (message === null || disabled) return;
    onSend(message.text, message.channel);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !touchFirst()) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form
      className='sticky bottom-0 z-10 border-t bg-background/95 pb-safe backdrop-blur-sm'
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className='mx-auto grid max-w-3xl gap-2 px-3 pt-2'>
        <div role='radiogroup' aria-label='Send as' className='flex gap-1'>
          {CHANNELS.map((option) => (
            <button
              key={option.value}
              type='button'
              role='radio'
              aria-checked={channel === option.value}
              onClick={() => setChannel(option.value)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs font-medium',
                channel === option.value ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className='flex items-end gap-2'>
          <label htmlFor={boxId} className='sr-only'>
            {channel === 'ic' ? 'Your next line' : 'Table talk'}
          </label>
          <Textarea
            id={boxId}
            value={text}
            rows={1}
            maxLength={LIMITS.message_characters}
            placeholder={channel === 'ic' ? 'What do you say or do?' : 'Talk to the table…'}
            className={cn('max-h-40 min-h-11 resize-none [field-sizing:content]', channel === 'ooc' && 'bg-muted')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {writing ? (
            <Button type='button' size='icon' variant='outline' className='size-11 shrink-0' aria-label='Stop the reply' onClick={onStop}>
              <Square aria-hidden />
            </Button>
          ) : (
            <Button type='submit' size='icon' className='size-11 shrink-0' aria-label='Send' disabled={disabled || text.trim() === ''}>
              <Send aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
