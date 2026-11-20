// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * One turn of a chat. Story messages read as the story: name, portrait, the text with actions in
 * italics. Out-of-character table talk sits in its own lane, smaller and set in, named by the
 * person rather than the character (docs/DESIGN.md, Out-of-character).
 *
 * A reply's alternatives (swipes) and a fork's branches are paged with arrows; every action is a
 * button in reach of a thumb, and the menu holds the rest.
 */
import { Bookmark, Brain, Languages, Volume2, ChevronLeft, ChevronRight, Ellipsis, FastForward, GitBranch, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'zephyrex/ui/dropdown-menu';
import { Textarea } from 'zephyrex/ui/textarea';
import { cn } from '~/lib/utils';
import { roleplayPieces } from '~/features/chat/roleplayText';
import { splitReasoning } from '~/features/prompt/assemble';
import { initials } from '../characters/CharacterTile';

export interface MessageView {
  id: string;
  role: 'user' | 'character' | 'narrator' | 'system';
  channel: 'ic' | 'ooc' | 'gm' | 'roll' | 'system';
  speaker: string;
  avatar: string | null;
  text: string;
  /** Pictures sent with it (A44). */
  images?: readonly string[];
  swipe: { index: number; count: number };
  fork: { index: number; count: number };
  bookmarked: boolean;
}

export interface MessageActions {
  onSwipe?: (step: -1 | 1) => void;
  /** Writes another alternative (offered on the last swipe of a character's reply). */
  onRegenerate?: () => void;
  onFork?: (step: -1 | 1) => void;
  onEdit?: (text: string) => void;
  onBookmark?: () => void;
  onBranch?: () => void;
  onDelete?: () => void;
  /** Carries on the shown alternative where it stopped (offered on a character's last message). */
  onContinue?: () => void;
  /** Reads the message aloud (A29), where the browser can speak. */
  onSpeak?: () => void;
  /** Translates the message for display (A43); the label names the language. */
  onTranslate?: { label: string; run: () => void };
}

const CHANNEL_LABEL: Record<MessageView['channel'], string | null> = {
  ic: null,
  ooc: 'Table talk',
  gm: 'To the GM',
  roll: 'Roll',
  system: 'Note',
};

function Pager({ label, index, count, onStep }: { label: string; index: number; count: number; onStep: (step: -1 | 1) => void }): ReactElement {
  return (
    <div className='flex items-center gap-1 text-xs text-muted-foreground' role='group' aria-label={label}>
      <Button type='button' variant='ghost' size='icon' className='size-9' aria-label={`Previous ${label.toLowerCase()}`} disabled={index === 0} onClick={() => onStep(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <span aria-live='polite'>
        {index + 1}/{count}
      </span>
      <Button type='button' variant='ghost' size='icon' className='size-9' aria-label={`Next ${label.toLowerCase()}`} disabled={index === count - 1} onClick={() => onStep(1)}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

/** A reply's reasoning (A45), folded: shown only when asked for, never read back to the model. */
function Reasoning({ text, writing }: { text: string; writing: boolean }): ReactElement {
  return (
    <details className='group mb-2 rounded-md border bg-muted/40 text-sm'>
      <summary className='flex min-h-11 cursor-pointer items-center gap-2 px-3 text-muted-foreground'>
        <Brain className='size-4' aria-hidden /> {writing ? 'Thinking…' : 'Thinking'}
      </summary>
      <p className='whitespace-pre-wrap px-3 pb-3 text-muted-foreground [overflow-wrap:anywhere]'>{text}</p>
    </details>
  );
}

function StoryText({ text, writing = false }: { text: string; writing?: boolean }): ReactElement {
  const { reasoning, reply } = splitReasoning(text);
  return (
    <>
      {reasoning !== '' && <Reasoning text={reasoning} writing={writing && reply === ''} />}
      <StoryPieces text={reply} />
    </>
  );
}

function StoryPieces({ text }: { text: string }): ReactElement {
  return (
    <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>
      {roleplayPieces(text).map((piece, index) =>
        piece.kind === 'action' ? (
          // Pieces have no identity beyond their place in this message.
          <em key={index} className='text-muted-foreground'>
            {piece.text}
          </em>
        ) : piece.kind === 'speech' ? (
          <span key={index} className='font-medium'>
            {piece.text}
          </span>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </p>
  );
}

/** How a chat is laid out on this device (A49): flat rows, bubbles (yours on the right), or a document. */
export type MessageLayout = 'flat' | 'bubbles' | 'document';

export function MessageItem({
  message,
  writing = false,
  layout = 'flat',
  translation,
  ...actions
}: {
  message: MessageView;
  writing?: boolean;
  layout?: MessageLayout;
  /** A translation to show under the text (A43): written, being written, or failed. */
  translation?: { status: 'writing' } | { status: 'done'; text: string; onHide: () => void } | { status: 'failed'; reason: string };
} & MessageActions): ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  const editId = useId();
  const label = CHANNEL_LABEL[message.channel];
  const tableTalk = message.channel === 'ooc' || message.channel === 'gm';
  const lastSwipe = message.swipe.index === message.swipe.count - 1;
  const story = !tableTalk && message.channel !== 'roll';
  const mine = message.role === 'user';

  return (
    <article
      aria-label={`${message.speaker}${label === null ? '' : `, ${label.toLowerCase()}`}`}
      aria-busy={writing}
      className={cn(
        'group flex gap-3',
        tableTalk && 'ml-6 rounded-lg bg-muted px-3 py-2 text-sm sm:ml-12',
        message.channel === 'roll' && 'rounded-lg border border-dashed px-3 py-2 text-sm',
        message.bookmarked && !tableTalk && 'border-l-2 border-primary pl-3',
        layout === 'bubbles' && story && 'rounded-2xl border bg-card px-3 py-2',
        layout === 'bubbles' && story && mine && 'ml-8 flex-row-reverse border-primary bg-accent text-accent-foreground sm:ml-16',
        layout === 'bubbles' && story && !mine && 'mr-8 sm:mr-16',
        layout === 'document' && 'leading-relaxed',
      )}
    >
      {!tableTalk && layout !== 'document' && (
        <Avatar className='size-10 shrink-0'>
          {message.avatar !== null && <AvatarImage src={message.avatar} alt='' />}
          <AvatarFallback>{initials(message.speaker)}</AvatarFallback>
        </Avatar>
      )}
      <div className='min-w-0 flex-1'>
        <header className='flex flex-wrap items-center gap-x-2'>
          <span className={cn('font-semibold', tableTalk && 'text-xs')}>{message.speaker}</span>
          {label !== null && <span className='text-xs text-muted-foreground'>{label}</span>}
          {message.bookmarked && <Bookmark className='size-3.5 fill-primary text-primary' aria-label='Bookmarked' />}
        </header>
        {editing === null ? (
          <>
            {tableTalk ? <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{message.text}</p> : <StoryText text={message.text} writing={writing} />}
            {(message.images ?? []).length > 0 && (
              <ul className='mt-2 flex flex-wrap gap-2' aria-label='Pictures'>
                {(message.images ?? []).map((url, index) => (
                  // Pictures have no identity beyond their place in this message.
                  <li key={index}>
                    <a href={url} target='_blank' rel='noreferrer' className='block'>
                      <img src={url} alt={`Picture ${index + 1} from ${message.speaker}`} className='max-h-40 max-w-full rounded-md border object-contain' />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {translation !== undefined && (
              <div className='mt-2 rounded-md border-l-2 border-primary bg-muted px-3 py-2 text-sm' aria-live='polite'>
                {translation.status === 'writing' && <p className='text-muted-foreground'>Translating…</p>}
                {translation.status === 'failed' && <p role='alert' className='text-destructive'>{translation.reason}</p>}
                {translation.status === 'done' && (
                  <>
                    <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{translation.text}</p>
                    <button type='button' className='mt-1 min-h-11 text-xs text-muted-foreground underline' onClick={translation.onHide}>
                      Hide translation
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <form
            className='mt-1 grid gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              actions.onEdit?.(editing);
              setEditing(null);
            }}
          >
            <label htmlFor={editId} className='sr-only'>
              Edit message
            </label>
            <Textarea id={editId} value={editing} rows={4} autoFocus onChange={(event) => setEditing(event.target.value)} />
            <div className='flex gap-2'>
              <Button type='submit' size='sm' className='h-10'>
                Save
              </Button>
              <Button type='button' size='sm' variant='ghost' className='h-10' onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {writing && message.text === '' && <p className='animate-pulse text-muted-foreground motion-reduce:animate-none'>Writing…</p>}
        {!writing && editing === null && (
          <footer className='mt-1 flex flex-wrap items-center gap-x-3'>
            {actions.onSwipe !== undefined && (message.swipe.count > 1 || actions.onRegenerate !== undefined) && (
              <div className='flex items-center'>
                {message.swipe.count > 1 && <Pager label='Reply' index={message.swipe.index} count={message.swipe.count} onStep={actions.onSwipe} />}
                {lastSwipe && actions.onRegenerate !== undefined && (
                  <Button type='button' variant='ghost' size='icon' className='size-9' aria-label='Write another reply' onClick={actions.onRegenerate}>
                    <RotateCw aria-hidden />
                  </Button>
                )}
              </div>
            )}
            {message.fork.count > 1 && actions.onFork !== undefined && <Pager label='Branch' index={message.fork.index} count={message.fork.count} onStep={actions.onFork} />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type='button' variant='ghost' size='icon' className='size-9' aria-label={`More for ${message.speaker}'s message`}>
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                {actions.onEdit !== undefined && (
                  <DropdownMenuItem onSelect={() => setEditing(message.text)}>
                    <Pencil aria-hidden /> Edit
                  </DropdownMenuItem>
                )}
                {actions.onTranslate !== undefined && (
                  <DropdownMenuItem onSelect={actions.onTranslate.run}>
                    <Languages aria-hidden /> {actions.onTranslate.label}
                  </DropdownMenuItem>
                )}
                {actions.onSpeak !== undefined && (
                  <DropdownMenuItem onSelect={actions.onSpeak}>
                    <Volume2 aria-hidden /> Read aloud
                  </DropdownMenuItem>
                )}
                {actions.onContinue !== undefined && (
                  <DropdownMenuItem onSelect={actions.onContinue}>
                    <FastForward aria-hidden /> Continue
                  </DropdownMenuItem>
                )}
                {actions.onBookmark !== undefined && (
                  <DropdownMenuItem onSelect={actions.onBookmark}>
                    <Bookmark aria-hidden /> {message.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  </DropdownMenuItem>
                )}
                {actions.onBranch !== undefined && (
                  <DropdownMenuItem onSelect={actions.onBranch}>
                    <GitBranch aria-hidden /> Branch from here
                  </DropdownMenuItem>
                )}
                {actions.onDelete !== undefined && (
                  <DropdownMenuItem onSelect={actions.onDelete} className='text-destructive'>
                    <Trash2 aria-hidden /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </footer>
        )}
      </div>
    </article>
  );
}
