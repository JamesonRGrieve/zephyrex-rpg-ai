// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A message of structured lines (docs/DESIGN.md, Structured lines), rendered as play, not text (the
 * operator, 2026-11-21: "It's clearly my character because it's beside my bubble"). The speaker's own
 * name is dropped, since the header already says who. Speech is a bubble styled by its manner (speak,
 * whisper, shout, vox, voxcast) and tagged with whom it's to; an action is its own accented line;
 * anything else is narration.
 */
import { Footprints, Radio, RadioTower } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '~/lib/utils';

export type Manner = 'speak' | 'whisper' | 'shout' | 'vox' | 'voxcast';
export type ShownLine =
  | { kind: 'say'; speaker: string; target: string | null; manner: Manner; text: string }
  | { kind: 'do'; speaker: string; target: string | null; text: string }
  | { kind: 'narrate'; text: string };

const MANNERS: readonly Manner[] = ['speak', 'whisper', 'shout', 'vox', 'voxcast'];
const MANNER_WORD: Record<string, Manner> = {
  says: 'speak',
  speaks: 'speak',
  whispers: 'whisper',
  whisper: 'whisper',
  shouts: 'shout',
  shout: 'shout',
  vox: 'vox',
  voxcast: 'voxcast',
};
// `Name (to X)`, `Name (to X, whispers)`, `Name (vox to X)`, `Name (voxcast)`, then `: "words"`.
const SAY = /^(.+?) \(([^)]*)\):\s*["“](.*)["”]\s*$/;

function readTag(tag: string): { target: string | null; manner: Manner } {
  let manner: Manner = 'speak';
  let target: string | null = null;
  for (const piece of tag.split(',').map((part) => part.trim().toLowerCase())) {
    const words = piece.split(/\s+/);
    const toAt = words.indexOf('to');
    for (const word of toAt < 0 ? words : words.slice(0, toAt)) {
      const found = MANNER_WORD[word];
      if (found !== undefined) manner = found;
    }
    if (toAt >= 0) {
      const name = piece.slice(piece.indexOf('to ') + 3).trim();
      const original = tag.slice(tag.toLowerCase().indexOf(name), tag.toLowerCase().indexOf(name) + name.length);
      target = name === 'everyone' || name === 'all' ? null : original;
    }
  }
  return { target, manner: MANNERS.includes(manner) ? manner : 'speak' };
}

/**
 * The message's lines, or null when it isn't structured (no line opens with a known name or
 * `Narrator:`), so older prose renders as before.
 */
export function readLines(text: string, names: readonly string[]): ShownLine[] | null {
  const known = [...names].filter((name) => name.trim() !== '').sort((a, b) => b.length - a.length);
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  let structured = 0;
  const shown = lines.map((raw): ShownLine => {
    const line = raw.trim();
    const narrator = /^Narrator:\s*(.*)$/i.exec(line);
    if (narrator !== null) {
      structured += 1;
      return { kind: 'narrate', text: narrator[1] ?? '' };
    }
    const say = SAY.exec(line);
    if (say !== null && known.some((name) => name.toLowerCase() === (say[1] ?? '').trim().toLowerCase())) {
      structured += 1;
      return { kind: 'say', speaker: (say[1] ?? '').trim(), ...readTag(say[2] ?? ''), text: say[3] ?? '' };
    }
    const actor = known.find((name) => line.toLowerCase().startsWith(`${name.toLowerCase()} `));
    if (actor !== undefined) {
      const rest = line.slice(actor.length + 1);
      const aimed = /^\(at ([^)]+)\)\s+(.*)$/i.exec(rest);
      if (aimed !== null) {
        structured += 1;
        return { kind: 'do', speaker: actor, target: (aimed[1] ?? '').trim(), text: (aimed[2] ?? '').trim() };
      }
      if (!/^[(:]/.test(rest)) {
        structured += 1;
        return { kind: 'do', speaker: actor, target: null, text: rest.trim() };
      }
    }
    return { kind: 'narrate', text: line };
  });
  return structured === 0 ? null : shown;
}

const BUBBLE: Record<Manner, string> = {
  speak: 'rounded-2xl border bg-card px-3 py-2',
  whisper: 'rounded-2xl border border-dashed bg-muted/40 px-3 py-1.5 text-sm italic text-muted-foreground',
  shout: 'rounded-lg border-2 border-destructive/70 bg-card px-3 py-2 text-lg font-bold uppercase tracking-wide',
  vox: 'rounded-md border border-emerald-500/50 bg-emerald-950/10 px-3 py-2 font-mono text-sm dark:bg-emerald-950/40',
  voxcast:
    'rounded-md border-y-2 border-emerald-500/70 bg-emerald-950/10 px-3 py-2 font-mono text-sm uppercase dark:bg-emerald-950/40',
};
const MANNER_LABEL: Record<Manner, string | null> = {
  speak: null,
  whisper: 'whispers',
  shout: 'shouts',
  vox: 'vox',
  voxcast: 'voxcast',
};

export function StructuredLines({ lines, speaker }: { lines: readonly ShownLine[]; speaker: string }): ReactElement {
  return (
    <div className='grid gap-2'>
      {lines.map((line, index) => {
        // Lines have no identity beyond their place in the message.
        const key = index;
        const other = line.kind !== 'narrate' && line.speaker.toLowerCase() !== speaker.toLowerCase();
        if (line.kind === 'say') {
          const tag = [MANNER_LABEL[line.manner], line.target === null ? null : `to ${line.target}`]
            .filter((part) => part !== null)
            .join(', ');
          return (
            <figure key={key} className='grid max-w-prose justify-items-start gap-0.5'>
              {(tag !== '' || other) && (
                <figcaption className='flex items-center gap-1 px-1 text-xs text-muted-foreground'>
                  {line.manner === 'vox' && <Radio className='size-3.5' aria-hidden />}
                  {line.manner === 'voxcast' && <RadioTower className='size-3.5' aria-hidden />}
                  {[other ? line.speaker : null, tag === '' ? null : tag].filter(Boolean).join(' · ')}
                </figcaption>
              )}
              <blockquote className={cn('[overflow-wrap:anywhere]', BUBBLE[line.manner])}>{line.text}</blockquote>
            </figure>
          );
        }
        if (line.kind === 'do') {
          return (
            <p
              key={key}
              className='flex items-start gap-2 border-l-2 border-primary/60 pl-2 text-[0.95em] [overflow-wrap:anywhere]'
            >
              <Footprints className='mt-1 size-3.5 shrink-0 text-primary' aria-label='Action' />
              <span>
                {other && <span className='font-medium'>{line.speaker} </span>}
                <span className='italic'>{other ? line.text : capitalised(line.text)}</span>
                {line.target !== null && <span className='ml-1 text-xs text-muted-foreground'>→ {line.target}</span>}
              </span>
            </p>
          );
        }
        return (
          <p key={key} className='[overflow-wrap:anywhere]'>
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
