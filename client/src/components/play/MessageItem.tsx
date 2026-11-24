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
import { type ReplyStats, statsLabel } from '~/features/chat/replyStats';
import { type Revision, RevisionButton } from './RevisionButton';
import { type DecisionCall, DecisionCalls } from './DecisionCalls';
import { type LineLabel, labelledLines } from '~/features/chat/labelLines';
import { CanonNotice, type CanonNoticeValue } from './CanonNotice';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Brain,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  EyeOff,
  FastForward,
  GitBranch,
  Hand,
  Languages,
  Map as MapIcon,
  Pencil,
  RotateCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { type ReactElement, useId, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from 'zephyrex/ui/dropdown-menu';
import { Textarea } from 'zephyrex/ui/textarea';
import { cn } from '~/lib/utils';
import { textAndCode } from '~/features/chat/codeBlocks';
import { roleplayPieces } from '~/features/chat/roleplayText';
import { locationBlocks, screenBlocks } from '~/features/chat/markup';
import { splitReasoning } from '~/features/prompt/assemble';
import { initials } from '../characters/CharacterTile';
import { CodeRunner } from './CodeRunner';
import { Coloured, ScreenBlock } from './ScreenBlock';
import { readLines, StructuredLines } from './StructuredLines';

export interface MessageView {
  id: string;
  role: 'user' | 'character' | 'narrator' | 'system';
  channel: 'ic' | 'ooc' | 'gm' | 'roll' | 'system';
  speaker: string;
  avatar: string | null;
  text: string;
  /** Pictures sent with it (A44). */
  images?: readonly string[];
  /** X-carded by the table (A25): shown as such, never read by the model. */
  xCarded?: boolean;
  /** Hidden by the person (/hide, audit gap 10): still shown, never read by the model. */
  hidden?: boolean;
  swipe: { index: number; count: number };
  fork: { index: number; count: number };
  bookmarked: boolean;
}

export interface MessageActions {
  onSwipe?: (step: -1 | 1) => void;
  /** Writes another alternative (offered on the last swipe of a character's reply). */
  onRegenerate?: () => void;
  /** Another alternative from a chosen model (AP4), kept as a swipe beside this one to compare. */
  onRegenerateWith?: { models: readonly { id: string; name: string }[]; run: (endpointId: string) => void };
  onFork?: (step: -1 | 1) => void;
  onEdit?: (text: string) => void;
  /** Saves the edit as a new alternative and runs on from it (the operator, 2026-11-23: edit, fork and regenerate). */
  onEditFork?: (text: string) => void;
  /**
   * The person's own line put in before this one, as a fork from just before it, and play runs on from it (the
   * operator, 2026-11-24: "an 'interject and fork before this' button to take the place of people at the table
   * doing the 'before the npc does that can I do this?'"). Offered on others' lines.
   */
  onInterject?: (text: string) => void;
  onBookmark?: () => void;
  /** Moves it up its branch, swapping with the message above (A9); offered where that has no other reply. */
  onMoveUp?: () => void;
  /** Moves it down, swapping with its only reply (A9). */
  onMoveDown?: () => void;
  onBranch?: () => void;
  /** What the branch action says: a campaign's is a rewind (docs/DESIGN.md, The play model). */
  branchLabel?: string;
  /** Copies the story up to this line into a new campaign of the same scenario. */
  onForkCampaign?: () => void;
  onDelete?: () => void;
  /** The X-card (A25): takes the message out of the story, or puts it back. */
  /**
   * Feedback for manual review (the operator, 2026-11-23: "per message feedback… the context behind every
   * instance of stupidity"): the server keeps the message's whole context with it.
   */
  onFeedback?: { given: 'good' | 'bad' | null; send: (verdict: 'good' | 'bad', reason: string, note: string) => void };
  /** The X-card on this message, with an optional reason (the operator, 2026-11-23). */
  onXCard?: (reason: string) => void;
  /** Hides the message from the model, or shows it to the model again (gap 10). */
  onHide?: () => void;
  /** Carries on the shown alternative where it stopped (offered on a character's last message). */
  onContinue?: () => void;
  /** Reads the message aloud (A29), where the browser can speak. */
  onSpeak?: () => void;
  /** Reads on from this message to the end of the story. */
  onSpeakFrom?: () => void;
  /** Translates the message for display (A43); the label names the language. */
  onTranslate?: { label: string; run: () => void };
}

const CHANNEL_LABEL: Record<MessageView['channel'], string | null> = {
  ic: null,
  ooc: 'Out of game',
  gm: 'Out of game',
  roll: 'Roll',
  system: 'Note',
};

function Pager({
  label,
  index,
  count,
  onStep,
}: {
  label: string;
  index: number;
  count: number;
  onStep: (step: -1 | 1) => void;
}): ReactElement {
  return (
    <div className='flex items-center gap-1 text-xs text-muted-foreground' role='group' aria-label={label}>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-9'
        aria-label={`Previous ${label.toLowerCase()}`}
        disabled={index === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      {/* Full foreground: muted text on a bubble's muted fill fails contrast (Storybook a11y). */}
      <span className='text-foreground' aria-live='polite'>
        {index + 1}/{count}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-9'
        aria-label={`Next ${label.toLowerCase()}`}
        disabled={index === count - 1}
        onClick={() => onStep(1)}
      >
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
  const parts = textAndCode(reply);
  return (
    <>
      {reasoning !== '' && <Reasoning text={reasoning} writing={writing && reply === ''} />}
      {parts.length === 0 && <StoryPieces text={reply} />}
      {parts.map((part, index) =>
        // Parts have no identity beyond their place in this message.
        part.kind === 'code' ? (
          <CodeRunner key={index} language={part.language} code={part.code} />
        ) : (
          <StoryPieces key={index} text={part.text} />
        ),
      )}
    </>
  );
}

/** Common ways a reply goes wrong, to sort flagged replies in review; the note says the rest. */
const FLAG_REASONS = [
  'Wrong speaker',
  'Spoke or acted for my character',
  'Out of character or as an assistant',
  'Invented a roll or a rule',
  'Ignored what I did',
  'Contradicts the story or the world',
  'Repetitive or rambling',
  'Other',
] as const;

/** A change of place (the operator, 2026-11-21: "a grand banner with a map icon"). */
export function LocationBanner({ name, within }: { name: string; within?: string }): ReactElement {
  return (
    <div
      role='note'
      aria-label={`Now at ${name}${within ? `, ${within}` : ''}`}
      className='relative my-3 overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-amber-900/30 to-amber-950/60 px-4 py-3 shadow-md'
    >
      <div className='flex items-center justify-center gap-3'>
        <span className='h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/60' aria-hidden />
        <MapIcon className='size-5 shrink-0 text-amber-300' aria-hidden />
        <span className='text-center font-serif text-lg font-semibold uppercase tracking-[0.2em] text-amber-100'>
          {name}
        </span>
        <MapIcon className='size-5 shrink-0 text-amber-300' aria-hidden />
        <span className='h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/60' aria-hidden />
      </div>
      {within !== undefined && within !== '' && (
        // Where the place is (town, region), under its name.
        <p className='mt-1 text-center font-serif text-xs uppercase tracking-[0.15em] text-amber-200/80'>{within}</p>
      )}
    </div>
  );
}

function StoryPieces({ text }: { text: string }): ReactElement {
  const places = locationBlocks(text);
  // A banner, or a heading the model wrote and that was dropped: render the blocks.
  const first = places[0];
  if (places.length !== 1 || first === undefined || first.kind !== 'text' || first.text !== text)
    return (
      <>
        {places.map((block, index) =>
          // Blocks have no identity beyond their place in this message.
          block.kind === 'location' ? (
            <LocationBanner key={index} name={block.name} within={block.within} />
          ) : (
            <StoryPieces key={index} text={block.kind === 'text' ? block.text.replace(/^\n+|\n+$/g, '') : ''} />
          ),
        )}
      </>
    );
  const blocks = screenBlocks(text);
  if (blocks.some((block) => block.kind === 'screen'))
    return (
      <>
        {blocks.map((block, index) =>
          block.kind === 'screen' ? (
            <ScreenBlock key={index} title={block.title} text={block.text} />
          ) : (
            <StoryPieces key={index} text={(block.kind === 'text' ? block.text : '').replace(/^\n+|\n+$/g, '')} />
          ),
        )}
      </>
    );
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
          <Coloured key={index} text={piece.text} />
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
  proposal,
  cost,
  canon,
  revision = null,
  labels = null,
  decisions = [],
  names = [],
  ...actions
}: {
  message: MessageView;
  /** The cast's names, for reading structured lines (docs/DESIGN.md, Structured lines). */
  names?: readonly string[];
  writing?: boolean;
  layout?: MessageLayout;
  /** A translation to show under the text (A43): written, being written, or failed. */
  translation?:
    { status: 'writing' } | { status: 'done'; text: string; onHide: () => void } | { status: 'failed'; reason: string };
  /** A table note the GM proposes (A11): kept only when a player adds it. */
  proposal?: { label: string; text: string; added: boolean; onAdd: () => void };
  /** What writing it cost (AP5), for a reply written in this visit. */
  cost?: ReplyStats;
  /** Its canon notice (docs/DESIGN.md, Canon warnings), once checked: yellow or red, with why. */
  canon?: CanonNoticeValue;
  /** A line the AI wrote again: its first answer and why, behind a small icon. */
  revision?: Revision | null;
  /** Who does and says what, line by line, as the decision model labelled it (line_labels). */
  labels?: readonly LineLabel[] | null;
  /** The decision models' calls about this message, side by side under it. */
  decisions?: readonly DecisionCall[];
} & MessageActions): ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  // The X-card's optional reason, while its box is open.
  const [carding, setCarding] = useState<string | null>(null);
  // The note for a flagged reply, while its box is open.
  const [flagging, setFlagging] = useState<string | null>(null);
  const [interjecting, setInterjecting] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const editId = useId();
  const label = CHANNEL_LABEL[message.channel];
  const tableTalk = message.channel === 'ooc' || message.channel === 'gm';
  const lastSwipe = message.swipe.index === message.swipe.count - 1;
  if (message.xCarded === true) {
    return (
      <article
        aria-label={`${message.speaker}, X-carded`}
        className='flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground'
      >
        <span>
          <X className='mr-1 inline size-4' aria-hidden />
          {message.speaker}’s message was X-carded: it is out of the story.
        </span>
        {actions.onXCard !== undefined && (
          <Button type='button' variant='ghost' className='h-11 shrink-0' onClick={() => actions.onXCard?.('')}>
            Put it back
          </Button>
        )}
      </article>
    );
  }
  const story = !tableTalk && message.channel !== 'roll';
  const mine = message.role === 'user';

  return (
    <article
      aria-label={`${message.speaker}${label === null ? '' : `, ${label.toLowerCase()}`}${message.hidden === true ? ', hidden from the model' : ''}`}
      aria-busy={writing}
      className={cn(
        'group flex gap-3',
        // Out of game (the operator, 2026-11-21): between the GM and "You", the player, never the
        // character; set apart from the story and from the Narrator.
        tableTalk &&
          'ml-6 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-50 sm:ml-12',
        message.channel === 'roll' && 'rounded-lg border border-dashed px-3 py-2 text-sm',
        message.bookmarked && !tableTalk && 'border-l-2 border-primary pl-3',
        layout === 'bubbles' && story && 'rounded-2xl border bg-card px-3 py-2',
        layout === 'bubbles' &&
          story &&
          mine &&
          'ml-8 flex-row-reverse border-primary bg-accent text-accent-foreground sm:ml-16',
        layout === 'bubbles' && story && !mine && 'mr-8 sm:mr-16',
        layout === 'document' && 'leading-relaxed',
        message.hidden === true && 'opacity-60',
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
          <span className={cn('min-w-0 font-semibold [overflow-wrap:anywhere]', tableTalk && 'text-xs')}>
            {tableTalk ? (mine ? 'You' : 'GM') : message.speaker}
          </span>
          {message.hidden === true && (
            <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
              <EyeOff className='size-3' aria-hidden /> Hidden from the model
            </span>
          )}
          {label !== null && <span className='text-xs text-muted-foreground'>{label}</span>}
          {message.bookmarked && <Bookmark className='size-3.5 fill-primary text-primary' aria-label='Bookmarked' />}
        </header>
        {editing === null ? (
          <>
            {tableTalk ? (
              <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{message.text}</p>
            ) : (
              (() => {
                // The decision model's labels, once the message has them; the reader's guess until then.
                // The model's thinking, folded under the line (the operator, 2026-11-22: "Just put thinking in
                // a collapsible under narrator"); the lines read only what follows it.
                // While it streams, the prose sits in a pending box; the lines are laid out once it's
                // finished (the operator, 2026-11-23: "a pending indication UI bounding box… then finalized").
                if (writing && message.text !== '')
                  return (
                    <div
                      role='status'
                      aria-label='Being written'
                      className='rounded-md border border-dashed border-muted-foreground/40 px-3 py-2'
                    >
                      <StoryText text={message.text} writing />
                    </div>
                  );
                const { reasoning, reply } = splitReasoning(message.text);
                const structured =
                  labels !== null && labels !== undefined
                    ? labelledLines(labels, message.speaker)
                    : readLines(reply, [message.speaker, ...names]);
                return structured === null ? (
                  <StoryText text={message.text} writing={writing} />
                ) : (
                  <>
                    {reasoning !== '' && <Reasoning text={reasoning} writing={false} />}
                    <StructuredLines lines={structured} speaker={message.speaker} />
                  </>
                );
              })()
            )}
            {(message.images ?? []).length > 0 && (
              <ul className='mt-2 flex flex-wrap gap-2' aria-label='Pictures'>
                {(message.images ?? []).map((url, index) => (
                  // Pictures have no identity beyond their place in this message.
                  <li key={index}>
                    <a href={url} target='_blank' rel='noreferrer' className='block'>
                      <img
                        referrerPolicy='no-referrer'
                        src={url}
                        alt={`Picture ${index + 1} from ${message.speaker}`}
                        className='max-h-40 max-w-full rounded-md border object-contain'
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {cost !== undefined && <p className='mt-1 text-xs text-muted-foreground'>{statsLabel(cost)}</p>}
            {proposal !== undefined && (
              <div className='mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'>
                <p>
                  <span className='font-medium'>The GM proposes a note ({proposal.label.toLowerCase()}):</span>{' '}
                  {proposal.text}
                </p>
                {proposal.added ? (
                  <span className='text-muted-foreground'>In the table notes</span>
                ) : (
                  <Button type='button' variant='outline' className='h-11 shrink-0' onClick={proposal.onAdd}>
                    Add to table notes
                  </Button>
                )}
              </div>
            )}
            {canon !== undefined && <CanonNotice notice={canon} className='mt-2' />}
            {revision !== null && (
              <div className='mt-1 flex justify-end'>
                <RevisionButton revision={revision} />
              </div>
            )}
            {translation !== undefined && (
              <div className='mt-2 rounded-md border-l-2 border-primary bg-muted px-3 py-2 text-sm' aria-live='polite'>
                {translation.status === 'writing' && <p className='text-muted-foreground'>Translating…</p>}
                {translation.status === 'failed' && (
                  <p role='alert' className='text-destructive'>
                    {translation.reason}
                  </p>
                )}
                {translation.status === 'done' && (
                  <>
                    <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{translation.text}</p>
                    <button
                      type='button'
                      className='mt-1 min-h-11 text-xs text-muted-foreground underline'
                      onClick={translation.onHide}
                    >
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
              {actions.onEditFork !== undefined && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='h-10'
                  onClick={() => {
                    actions.onEditFork?.(editing);
                    setEditing(null);
                  }}
                >
                  Save and redo from here
                </Button>
              )}
              <Button type='button' size='sm' variant='ghost' className='h-10' onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {interjecting !== null && (
          <form
            className='mt-2 grid gap-2 rounded-md border p-3'
            onSubmit={(event) => {
              event.preventDefault();
              if (interjecting.trim() === '') return;
              actions.onInterject?.(interjecting.trim());
              setInterjecting(null);
            }}
          >
            <label htmlFor={`${editId}-interject`} className='text-sm font-medium'>
              Before {message.speaker} does that…
            </label>
            <Textarea
              id={`${editId}-interject`}
              value={interjecting}
              rows={3}
              autoFocus
              placeholder='What your character does or says first'
              onChange={(event) => setInterjecting(event.target.value)}
            />
            <div className='flex gap-2'>
              <Button type='submit' size='sm' className='h-10'>
                Interject
              </Button>
              <Button type='button' size='sm' variant='ghost' className='h-10' onClick={() => setInterjecting(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {flagging !== null && (
          <form
            className='mt-2 grid gap-2 rounded-md border p-3'
            onSubmit={(event) => {
              event.preventDefault();
              actions.onFeedback?.send('bad', flagReason, flagging.trim());
              setFlagging(null);
              setFlagReason('');
            }}
          >
            <label htmlFor={`${editId}-reason`} className='text-sm font-medium'>
              Reason
            </label>
            <select
              id={`${editId}-reason`}
              className='h-11 rounded-md border bg-background px-2 text-sm'
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
            >
              <option value=''>Not given</option>
              {FLAG_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <label htmlFor={`${editId}-flag`} className='text-sm font-medium'>
              What went wrong? (optional; the reply&apos;s whole context is kept for review)
            </label>
            <Textarea
              id={`${editId}-flag`}
              rows={2}
              value={flagging}
              autoFocus
              onChange={(event) => setFlagging(event.target.value)}
            />
            <div className='flex gap-2'>
              <Button type='submit' size='sm' className='h-10'>
                Flag
              </Button>
              <Button type='button' size='sm' variant='ghost' className='h-10' onClick={() => setFlagging(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {carding !== null && (
          <form
            className='mt-2 grid gap-2 rounded-md border p-3'
            onSubmit={(event) => {
              event.preventDefault();
              actions.onXCard?.(carding.trim());
              setCarding(null);
            }}
          >
            <label htmlFor={`${editId}-card`} className='text-sm font-medium'>
              X-card this. What should the story stay away from? (optional)
            </label>
            <Textarea
              id={`${editId}-card`}
              rows={2}
              value={carding}
              autoFocus
              onChange={(event) => setCarding(event.target.value)}
            />
            <div className='flex gap-2'>
              <Button type='submit' size='sm' className='h-10'>
                X-card
              </Button>
              <Button type='button' size='sm' variant='ghost' className='h-10' onClick={() => setCarding(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <DecisionCalls calls={decisions} />
        {writing && message.text === '' && (
          <p className='animate-pulse text-muted-foreground motion-reduce:animate-none'>Writing…</p>
        )}
        {!writing && editing === null && (
          <footer className='mt-1 flex flex-wrap items-center gap-x-3'>
            {actions.onSwipe !== undefined && (message.swipe.count > 1 || actions.onRegenerate !== undefined) && (
              <div className='flex items-center'>
                {message.swipe.count > 1 && (
                  <Pager label='Reply' index={message.swipe.index} count={message.swipe.count} onStep={actions.onSwipe} />
                )}
                {lastSwipe && actions.onRegenerate !== undefined && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-9'
                    aria-label='Write another reply'
                    onClick={actions.onRegenerate}
                  >
                    <RotateCw aria-hidden />
                  </Button>
                )}
              </div>
            )}
            {message.fork.count > 1 && actions.onFork !== undefined && (
              <Pager label='Branch' index={message.fork.index} count={message.fork.count} onStep={actions.onFork} />
            )}
            {/* The everyday actions under the message; the rest a level down (the operator, 2026-11-22: "The 3
                dots under messages also needs sub menus and the super common stuff needs broken out under the
                message"). */}
            {actions.onEdit !== undefined && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                aria-label='Edit'
                onClick={() => setEditing(message.text)}
              >
                <Pencil aria-hidden />
              </Button>
            )}
            {actions.onSpeak !== undefined && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                aria-label='Read aloud'
                onClick={actions.onSpeak}
              >
                <Volume2 aria-hidden />
              </Button>
            )}
            {actions.onContinue !== undefined && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                aria-label='Continue'
                onClick={actions.onContinue}
              >
                <FastForward aria-hidden />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-9'
                  aria-label={`More for ${message.speaker}'s message`}
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                {actions.onInterject !== undefined && (
                  <DropdownMenuItem onSelect={() => setInterjecting('')}>
                    <Hand aria-hidden /> Interject before this
                  </DropdownMenuItem>
                )}
                {actions.onTranslate !== undefined && (
                  <DropdownMenuItem onSelect={actions.onTranslate.run}>
                    <Languages aria-hidden /> {actions.onTranslate.label}
                  </DropdownMenuItem>
                )}
                {actions.onFeedback !== undefined && (
                  <>
                    <DropdownMenuItem onSelect={() => actions.onFeedback?.send('good', '', '')}>
                      <ThumbsUp aria-hidden /> {actions.onFeedback.given === 'good' ? 'Marked good' : 'Good reply'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFlagging('')}>
                      <ThumbsDown aria-hidden />{' '}
                      {actions.onFeedback.given === 'bad' ? 'Flagged; flag again' : 'Flag this reply'}
                    </DropdownMenuItem>
                  </>
                )}
                {actions.onSpeakFrom !== undefined && (
                  <DropdownMenuItem onSelect={actions.onSpeakFrom}>
                    <Volume2 aria-hidden /> Read from here to the end
                  </DropdownMenuItem>
                )}
                {actions.onBookmark !== undefined && (
                  <DropdownMenuItem onSelect={actions.onBookmark}>
                    <Bookmark aria-hidden /> {message.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  </DropdownMenuItem>
                )}
                {actions.onXCard !== undefined && (
                  <DropdownMenuItem onSelect={() => setCarding('')}>
                    <X aria-hidden /> X-card
                  </DropdownMenuItem>
                )}
                {actions.onHide !== undefined && (
                  <DropdownMenuItem onSelect={actions.onHide}>
                    <EyeOff aria-hidden /> {message.hidden === true ? 'Show to the model' : 'Hide from the model'}
                  </DropdownMenuItem>
                )}
                {(actions.onRegenerateWith?.models.length ?? 0) > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <RotateCw aria-hidden /> Again with…
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {actions.onRegenerateWith?.models.map((model) => (
                        <DropdownMenuItem key={model.id} onSelect={() => actions.onRegenerateWith?.run(model.id)}>
                          {model.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {(actions.onBranch !== undefined ||
                  actions.onForkCampaign !== undefined ||
                  actions.onMoveUp !== undefined ||
                  actions.onMoveDown !== undefined) && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <GitBranch aria-hidden /> Branch
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {actions.onBranch !== undefined && (
                        <DropdownMenuItem onSelect={actions.onBranch}>
                          <GitBranch aria-hidden /> {actions.branchLabel ?? 'Branch from here'}
                        </DropdownMenuItem>
                      )}
                      {actions.onForkCampaign !== undefined && (
                        <DropdownMenuItem onSelect={actions.onForkCampaign}>
                          <GitBranch aria-hidden /> Fork a new campaign from here
                        </DropdownMenuItem>
                      )}
                      {actions.onMoveUp !== undefined && (
                        <DropdownMenuItem onSelect={actions.onMoveUp}>
                          <ArrowUp aria-hidden /> Move up
                        </DropdownMenuItem>
                      )}
                      {actions.onMoveDown !== undefined && (
                        <DropdownMenuItem onSelect={actions.onMoveDown}>
                          <ArrowDown aria-hidden /> Move down
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {actions.onDelete !== undefined && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={actions.onDelete} className='text-destructive'>
                      <Trash2 aria-hidden /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </footer>
        )}
      </div>
    </article>
  );
}
