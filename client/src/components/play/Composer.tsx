// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Where the person writes. A switch says whether this is the story or table talk, and the box takes
 * `/ooc`, `((…))` and `//` for one message (features/chat/outgoing.ts). Enter sends on a keyboard;
 * on a touch screen Enter is a new line and the send button sends. It stays above the on-screen
 * keyboard and the home indicator.
 */
import { BookOpen, ImagePlus, Mic, MicOff, Send, Square, WandSparkles, X } from 'lucide-react';
import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { useDictation } from '~/features/speech/useDictation';
import { type Command, parseCommand } from '~/features/chat/commands';
import { isScript } from '~/features/chat/stscript';
import { PICTURE_TYPES, pictureFromFile } from '~/features/media/picture';
import { Textarea } from 'zephyrex/ui/textarea';
import { cn } from '~/lib/utils';
import { CanonNotice, type CanonNoticeValue } from './CanonNotice';

/** A story line is checked against canon once it is this long, this long after the last keystroke. */
const CANON_MIN_CHARACTERS = 12;
const CANON_DELAY_MS = 1200;
import { LIMITS, type QuickReplyAutoRun } from '~/contract';
import { type ComposerChannel, outgoing } from '~/features/chat/outgoing';

const CHANNELS: { value: ComposerChannel; label: string }[] = [
  { value: 'ic', label: 'Story' },
  { value: 'ooc', label: 'Table talk' },
  { value: 'gm', label: 'Ask the GM' },
];

const BOX_LABELS: Record<ComposerChannel, string> = { ic: 'Your next line', ooc: 'Table talk', gm: 'A question for the GM' };
const PLACEHOLDERS: Record<ComposerChannel, string> = {
  ic: 'What do you say or do?',
  ooc: 'Talk to the table…',
  gm: 'Ask the GM, out of character…',
};

/** Whether the device's main pointer is coarse (a finger), where Enter should not send. */
function touchFirst(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export interface ComposerQuickReply {
  id: string;
  label: string;
  text: string;
  action: 'send' | 'fill';
  channel: 'ic' | 'ooc';
  /** When it runs by itself (A38); only on chat_open may it send. */
  autoRun?: QuickReplyAutoRun;
}

/** The first quick reply that fills on `trigger`, if any (the list is in button order). */
function fillOn(replies: readonly ComposerQuickReply[], trigger: QuickReplyAutoRun): ComposerQuickReply | undefined {
  return replies.find((reply) => reply.autoRun === trigger && reply.action === 'fill');
}

export function Composer({
  writing,
  disabled = false,
  onSend,
  onStop,
  onImpersonate,
  onNarrate,
  onCommand,
  onScript,
  castNames = [],
  quickReplies = [],
  repliesWritten = 0,
  onCheckCanon,
}: {
  writing: boolean;
  disabled?: boolean;
  /** `images` (A44): pictures attached to the line, as data URLs. */
  onSend: (text: string, channel: ComposerChannel, images?: string[]) => void;
  onStop: () => void;
  /** Writes the person's own next line for them to edit and send (Impersonate). */
  onImpersonate?: () => Promise<string | null>;
  /** Asks the GM to narrate what happens next (A20). */
  onNarrate?: () => void;
  /** Runs a slash command (A37); without it, a slash line is sent as text. */
  onCommand?: (command: Command) => void;
  /** Runs an STscript line (A37): pipes, variables, conditions, loops; `/setinput` fills this box. */
  onScript?: (script: string, setInput: (text: string) => void) => void;
  /** The cast's names, so `/sendas` finds a name with spaces. */
  castNames?: readonly string[];
  /** Buttons that send or fill in a saved line (A32), their macros already filled. */
  quickReplies?: readonly ComposerQuickReply[];
  /** How many replies have been written while this chat was open: each one runs the after-reply quick reply (A38). */
  repliesWritten?: number;
  /**
   * Checks a story line against canon as it is written (docs/DESIGN.md, Canon warnings): the notice
   * shows above the box; the person may send anyway. Without it, no check.
   */
  onCheckCanon?: (text: string, signal: AbortSignal) => Promise<CanonNoticeValue | null>;
}): ReactElement {
  // A quick reply that fills on opening the chat (A38) is the box's first text.
  const [text, setText] = useState(() => fillOn(quickReplies, 'chat_open')?.text ?? '');
  const [channel, setChannel] = useState<ComposerChannel>(() => fillOn(quickReplies, 'chat_open')?.channel ?? 'ic');
  // The story line's canon notice, checked a moment after the person stops typing; shown only while
  // the box still holds the line it was checked for.
  const [canon, setCanon] = useState<{ line: string; notice: CanonNoticeValue | null } | null>(null);
  const checking = onCheckCanon !== undefined && channel === 'ic';
  const line = text.trim();
  useEffect(() => {
    if (!checking || line.length < CANON_MIN_CHARACTERS || line.startsWith('/')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void onCheckCanon?.(line, controller.signal).then((notice) => {
        if (!controller.signal.aborted) setCanon({ line, notice });
      });
    }, CANON_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [line, checking, onCheckCanon]);
  const canonNotice = checking && canon !== null && canon.line === line ? canon.notice : null;

  // After each reply (A38): adjusted during render when the count moves, React's pattern for state
  // that follows a prop. An after-reply quick reply only ever fills (the contract refuses a send).
  const [repliesSeen, setRepliesSeen] = useState(repliesWritten);
  if (repliesWritten !== repliesSeen) {
    setRepliesSeen(repliesWritten);
    const next = fillOn(quickReplies, 'after_reply');
    if (next !== undefined && text.trim() === '') {
      setText(next.text);
      setChannel(next.channel);
    }
  }

  // Sends on opening the chat (A38): once, as soon as the quick replies have loaded, even where
  // React runs effects twice in development.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || quickReplies.length === 0) return;
    opened.current = true;
    for (const reply of quickReplies) {
      if (reply.autoRun === 'chat_open' && reply.action === 'send') onSend(reply.text, reply.channel);
    }
  }, [quickReplies, onSend]);
  const boxId = useId();
  // Dictation (A29): each finished phrase is added to what is typed.
  const dictation = useDictation((phrase) =>
    setText((current) => (current.trim() === '' ? phrase : `${current.trimEnd()} ${phrase}`)),
  );

  const [images, setImages] = useState<string[]>([]);
  const [pictureProblem, setPictureProblem] = useState<string | null>(null);
  const attachId = useId();

  const [commandProblem, setCommandProblem] = useState<string | null>(null);

  const send = () => {
    // A script (A37) runs whole: it pipes, or uses STscript's own commands.
    if (onScript !== undefined && isScript(text)) {
      setCommandProblem(null);
      setText('');
      onScript(text, setText);
      return;
    }
    // A slash command (A37) runs instead of being sent; one that is not a command says why.
    const command = onCommand === undefined ? null : parseCommand(text, castNames);
    if (command !== null && onCommand !== undefined) {
      if ('unknown' in command) {
        setCommandProblem(command.unknown);
        return;
      }
      setCommandProblem(null);
      setText('');
      // /impersonate fills this box, as Write my line does.
      if (command.name === 'impersonate' && onImpersonate !== undefined) {
        void onImpersonate().then((line) => {
          if (line !== null && line.trim() !== '') setText(line.trim());
        });
        return;
      }
      onCommand(command);
      return;
    }
    setCommandProblem(null);
    const message = outgoing(text, channel);
    if (message === null || disabled) return;
    if (images.length > 0 && message.channel === 'ic') onSend(message.text, message.channel, images);
    else onSend(message.text, message.channel);
    // After a send (A38): the after-send quick reply fills the box for the next line.
    const next = fillOn(quickReplies, 'after_send');
    setText(next?.text ?? '');
    if (next !== undefined) setChannel(next.channel);
    setImages([]);
  };

  /** Pictures for the line (A44): each checked as an avatar is, at most the contract's number. */
  const attach = async (files: readonly File[]) => {
    const pictures = await Promise.all(files.map((file) => pictureFromFile(file)));
    const refused = pictures.find((picture) => 'refused' in picture);
    setPictureProblem(refused !== undefined && 'refused' in refused ? refused.refused : null);
    const urls = pictures.flatMap((picture) => ('url' in picture ? [picture.url] : []));
    setImages((current) => [...current, ...urls].slice(0, LIMITS.images_per_message));
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
        {canonNotice !== null && <CanonNotice notice={canonNotice} />}
        {quickReplies.length > 0 && (
          <div role='group' aria-label='Quick replies' className='-mx-3 flex gap-2 overflow-x-auto px-3 pb-1'>
            {quickReplies.map((reply) => (
              <Button
                key={reply.id}
                type='button'
                variant='outline'
                size='sm'
                className='h-9 shrink-0 rounded-full'
                disabled={disabled || (reply.action === 'send' && writing)}
                title={reply.text}
                onClick={() => {
                  if (reply.action === 'fill') {
                    setText(reply.text);
                    setChannel(reply.channel);
                  } else {
                    onSend(reply.text, reply.channel);
                  }
                }}
              >
                {reply.label}
              </Button>
            ))}
          </div>
        )}
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
        {commandProblem !== null && (
          <p role='alert' className='text-sm text-destructive'>
            {commandProblem}
          </p>
        )}
        {(images.length > 0 || pictureProblem !== null) && (
          <div className='flex flex-wrap items-center gap-2'>
            {images.map((url, index) => (
              // Attached pictures have no identity beyond their place in this line.
              <div key={index} className='relative'>
                <img src={url} alt={`Attached picture ${index + 1}`} className='size-16 rounded-md border object-cover' />
                <button
                  type='button'
                  className='absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border bg-background'
                  aria-label={`Remove attached picture ${index + 1}`}
                  onClick={() => setImages(images.filter((_url, at) => at !== index))}
                >
                  <X className='size-4' aria-hidden />
                </button>
              </div>
            ))}
            {pictureProblem !== null && (
              <p role='alert' className='text-sm text-destructive'>
                {pictureProblem}
              </p>
            )}
          </div>
        )}
        {/* On a phone the box takes its own row and the tools sit below it: beside five 44 px buttons
            it was a 70 px column (found by the visual audit). From sm up it fills the row between them. */}
        <div className='flex flex-wrap items-end gap-2 sm:flex-nowrap'>
          {channel === 'ic' && !writing && (
            <>
              <input
                id={attachId}
                type='file'
                accept={PICTURE_TYPES.join(',')}
                multiple
                aria-label='Attach a picture'
                className='peer sr-only'
                disabled={disabled || images.length >= LIMITS.images_per_message}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  void attach(files);
                }}
              />
              <label
                htmlFor={attachId}
                className={cn(
                  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                  images.length >= LIMITS.images_per_message && 'pointer-events-none text-muted-foreground',
                )}
              >
                <ImagePlus className='size-5' aria-hidden />
              </label>
            </>
          )}
          <label htmlFor={boxId} className='sr-only'>
            {BOX_LABELS[channel]}
          </label>
          <Textarea
            id={boxId}
            value={text}
            rows={1}
            maxLength={LIMITS.message_characters}
            placeholder={PLACEHOLDERS[channel]}
            className={cn(
              'order-first max-h-40 min-h-11 min-w-0 basis-full resize-none [field-sizing:content] sm:order-none sm:basis-0 sm:flex-1',
              channel !== 'ic' && 'bg-muted',
            )}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {dictation.supported && !writing && (
            <Button
              type='button'
              size='icon'
              variant={dictation.listening ? 'secondary' : 'ghost'}
              className='size-11 shrink-0'
              aria-label={dictation.listening ? 'Stop dictating' : 'Dictate'}
              aria-pressed={dictation.listening}
              disabled={disabled}
              onClick={dictation.toggle}
            >
              {dictation.listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
            </Button>
          )}
          {onNarrate !== undefined && !writing && channel === 'ic' && (
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-11 shrink-0'
              aria-label='Narrate what happens next'
              disabled={disabled}
              onClick={onNarrate}
            >
              <BookOpen aria-hidden />
            </Button>
          )}
          {onImpersonate !== undefined && !writing && channel === 'ic' && (
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-11 shrink-0'
              aria-label='Write my line for me'
              disabled={disabled}
              onClick={() =>
                void onImpersonate().then((line) => {
                  if (line !== null && line.trim() !== '') setText(line.trim());
                })
              }
            >
              <WandSparkles aria-hidden />
            </Button>
          )}
          {writing ? (
            <Button
              type='button'
              size='icon'
              variant='outline'
              className='ms-auto size-11 shrink-0 sm:ms-0'
              aria-label='Stop the reply'
              onClick={onStop}
            >
              <Square aria-hidden />
            </Button>
          ) : (
            <Button
              type='submit'
              size='icon'
              className='ms-auto size-11 shrink-0 sm:ms-0'
              aria-label='Send'
              disabled={disabled || text.trim() === ''}
            >
              <Send aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
