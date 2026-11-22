// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A message of structured lines (docs/DESIGN.md, Structured lines), rendered as play, not text (the
 * operator, 2026-11-21: "It's clearly my character because it's beside my bubble"). The speaker's own
 * name is dropped, since the header already says who. Speech is a bubble styled by its manner (speak,
 * whisper, shout, vox, voxcast) and tagged with whom it's to; an action is its own accented line;
 * anything else is narration.
 */
import {
  Armchair,
  Beer,
  BookOpen,
  Brain,
  Car,
  Church,
  Coins,
  Cpu,
  Crosshair,
  DoorOpen,
  Droplets,
  Ear,
  Eye,
  EyeOff,
  Flame,
  Footprints,
  Frown,
  Gift,
  Hand,
  HandCoins,
  Heart,
  HeartPulse,
  Key,
  Laugh,
  type LucideIcon,
  MessageCircle,
  Moon,
  Mountain,
  Music,
  PenLine,
  Radio,
  RadioTower,
  Search,
  Shield,
  Shirt,
  Skull,
  Sparkles,
  Swords,
  Target,
  Utensils,
  WandSparkles,
  Waves,
  Wrench,
} from 'lucide-react';
import { type ActionKind, actionKind } from '~/features/chat/actionKind';
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
// The words, then anything the speaker does after them on the same line ("She shakes her head.").
const SAY = /^(.+?) \(([^)]*)\):\s*["“]([^"”]*)["”]\s*(.*)$/;

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
  const shown = lines.flatMap((raw): ShownLine | ShownLine[] => {
    const line = raw.trim();
    const narrator = /^Narrator:\s*(.*)$/i.exec(line);
    if (narrator !== null) {
      structured += 1;
      return { kind: 'narrate', text: narrator[1] ?? '' };
    }
    const say = SAY.exec(line);
    // Speech in the structured form is the speaker's whoever they are: an NPC the cast list doesn't
    // know still gets a bubble, captioned with their name.
    if (
      say !== null &&
      (known.some((name) => name.toLowerCase() === (say[1] ?? '').trim().toLowerCase()) ||
        /\b(to|vox|voxcast|whispers|shouts)\b/i.test(say[2] ?? ''))
    ) {
      structured += 1;
      const speaker = (say[1] ?? '').trim();
      const spoken: ShownLine = { kind: 'say', speaker, ...readTag(say[2] ?? ''), text: say[3] ?? '' };
      const after = (say[4] ?? '').trim();
      return after === '' ? spoken : [spoken, { kind: 'do', speaker, target: null, text: after }];
    }
    const actor = known.find((name) => line.toLowerCase().startsWith(`${name.toLowerCase()} `));
    if (actor !== undefined) {
      const rest = line.slice(actor.length + 1);
      const aimed = /^\(at ([^)]+)\)\s+(.*)$/i.exec(rest);
      if (aimed !== null) {
        structured += 1;
        return { kind: 'do', speaker: actor, target: (aimed[1] ?? '').trim(), text: (aimed[2] ?? '').trim() };
      }
      if (!/^[(:]/.test(rest) && actsWith(rest)) {
        structured += 1;
        return { kind: 'do', speaker: actor, target: null, text: rest.trim() };
      }
    }
    return { kind: 'narrate', text: line };
  });
  return structured === 0 ? null : shown.flatMap(withSpeechApart).flatMap(actionApart);
}

// Opaque fills, so the tail can sit over the bubble's edge without a seam.
const BUBBLE: Record<Manner, string> = {
  speak: 'rounded-2xl border bg-card px-3 py-2',
  whisper: 'rounded-2xl border border-dashed bg-muted px-3 py-1.5 text-sm italic text-muted-foreground',
  shout: 'rounded-lg border-2 border-destructive/70 bg-card px-3 py-2 text-lg font-bold uppercase tracking-wide',
  vox: 'rounded-md border border-emerald-500/50 bg-emerald-50 px-3 py-2 font-mono text-sm dark:bg-emerald-950',
  voxcast:
    'rounded-md border-2 border-emerald-500/70 bg-emerald-50 px-3 py-2 font-mono text-sm uppercase dark:bg-emerald-950',
};
/**
 * The speech bubble's tail at its bottom left (the operator, 2026-11-21: "Those aren't speech bubbles
 * there's no tick to the bottom left"): a square turned 45°, bordered on its outer sides, in the
 * bubble's own fill and border.
 */
const TAIL: Record<Manner, string> = {
  speak: 'border-b border-r bg-card',
  whisper: 'border-b border-r border-dashed bg-muted',
  shout: 'border-b-2 border-r-2 border-destructive/70 bg-card',
  vox: 'border-b border-r border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950',
  voxcast: 'border-b-2 border-r-2 border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950',
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
              <blockquote className={cn('relative mb-1.5 [overflow-wrap:anywhere]', BUBBLE[line.manner])}>
                {line.text}
                <span aria-hidden className={cn('absolute -bottom-[7px] left-4 size-3 rotate-45', TAIL[line.manner])} />
              </blockquote>
            </figure>
          );
        }
        if (line.kind === 'do') {
          return (
            <p
              key={key}
              className='flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 [overflow-wrap:anywhere]'
            >
              <ActionIcon kind={actionKind(line.text)} />
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

const ACTION_ICONS: Record<ActionKind, { icon: LucideIcon; label: string }> = {
  relieve: { icon: Droplets, label: 'Relieves themselves' },
  drink: { icon: Beer, label: 'Drinks' },
  eat: { icon: Utensils, label: 'Eats' },
  sleep: { icon: Moon, label: 'Rests' },
  fire: { icon: Flame, label: 'Fire' },
  heal: { icon: HeartPulse, label: 'Heals' },
  pray: { icon: Church, label: 'Prays' },
  spell: { icon: WandSparkles, label: 'Casts' },
  psychic: { icon: Brain, label: 'Psychic' },
  shoot: { icon: Crosshair, label: 'Shoots' },
  attack: { icon: Swords, label: 'Attacks' },
  defend: { icon: Shield, label: 'Defends' },
  throw: { icon: Target, label: 'Throws' },
  hack: { icon: Cpu, label: 'Tech' },
  repair: { icon: Wrench, label: 'Repairs' },
  unlock: { icon: Key, label: 'Unlocks' },
  open: { icon: DoorOpen, label: 'Opens' },
  steal: { icon: HandCoins, label: 'Steals' },
  pay: { icon: Coins, label: 'Pays' },
  give: { icon: Gift, label: 'Gives' },
  write: { icon: PenLine, label: 'Writes' },
  read: { icon: BookOpen, label: 'Reads' },
  music: { icon: Music, label: 'Music' },
  laugh: { icon: Laugh, label: 'Laughs' },
  cry: { icon: Frown, label: 'Weeps' },
  love: { icon: Heart, label: 'Affection' },
  threaten: { icon: Skull, label: 'Threatens' },
  social: { icon: MessageCircle, label: 'Social' },
  listen: { icon: Ear, label: 'Listens' },
  look: { icon: Eye, label: 'Looks' },
  search: { icon: Search, label: 'Searches' },
  stealth: { icon: EyeOff, label: 'Stealth' },
  swim: { icon: Waves, label: 'Swims' },
  climb: { icon: Mountain, label: 'Climbs' },
  ride: { icon: Car, label: 'Rides' },
  sit: { icon: Armchair, label: 'Sits' },
  dress: { icon: Shirt, label: 'Dresses' },
  move: { icon: Footprints, label: 'Moves' },
  use: { icon: Hand, label: 'Uses' },
  other: { icon: Sparkles, label: 'Action' },
};

/** The action's kind as its icon (features/chat/actionKind.ts). */
function ActionIcon({ kind }: { kind: ActionKind }): ReactElement {
  const { icon: Icon, label } = ACTION_ICONS[kind];
  return <Icon className='mt-0.5 size-4 shrink-0 text-primary' aria-label={label} />;
}

/**
 * An action that carries speech is the action, then the words as a bubble (the operator, 2026-11-21:
 * Brakka's "Snorts… wiping foam from her beard. "Aye, I reckon…"" was one action card). Attribution
 * left between quotes ("she says") stays with the action.
 */
export function withSpeechApart(line: ShownLine): ShownLine[] {
  if (line.kind !== 'do' || !/["“]/.test(line.text)) return [line];
  const pieces: ShownLine[] = [];
  let at = 0;
  for (const match of line.text.matchAll(/["“]([^"”]+)["”]/g)) {
    const before = line.text.slice(at, match.index).trim().replace(/[,:]$/, '').trim();
    if (before !== '') pieces.push({ ...line, text: before });
    pieces.push({ kind: 'say', speaker: line.speaker, target: line.target, manner: 'speak', text: (match[1] ?? '').trim() });
    at = match.index + match[0].length;
  }
  const after = line.text
    .slice(at)
    .trim()
    .replace(/^[,.]\s*/, '');
  if (after !== '' && /\p{L}/u.test(after)) pieces.push({ ...line, text: after });
  return pieces.length === 0 ? [line] : pieces;
}

const IRREGULAR =
  /^(?:sat|stood|took|went|came|ran|saw|said|made|gave|got|held|kept|left|put|set|threw|drew|fell|felt|knew|spun|struck|swung|rose|broke|bit|hid|led|let|lay|shook|slid|spat|stuck|swore|tore|woke|wore|wrote|drank|ate|fought|caught|brought|bought|thought|sought|taught|hit|cut|shut|read|began|became|bent|blew|built|chose|clung|crept|dealt|dove|dug|fled|flung|flew|forgot|froze|grew|hung|heard|lit|lost|meant|met|paid|quit|rang|rode|sang|sank|shot|shone|slept|slung|spoke|sprang|stole|stung|stank|strode|swam|swept|thrust|told|trod|understood|won|wound|wrung|can|will|would|could|should|might|must|may|tries|cries|flies|dies|lies|ties)$/i;

/**
 * Whether what follows a name is that person acting (the RC run, 2026-11-22: "The Rogue Trader vessel
 * Fortune of Varn drifts…" was credited to the Rogue Trader): it opens with a verb (walks, nodded,
 * sat, slowly turns), not a word that goes on naming something.
 */
export function actsWith(rest: string): boolean {
  const words = rest.trim().split(/\s+/);
  const word = (words[0] ?? '').replace(/[^\p{L}'-]/gu, '');
  if (word === '') return false;
  if (/ly$/i.test(word)) return actsWith(words.slice(1).join(' '));
  return /(?:s|ed)$/i.test(word) || IRREGULAR.test(word);
}

/** Words that keep a later sentence on the actor (she, his, them…), not the scene's. */
const ACTOR_WORDS = /^(?:she|he|they|it|her|his|their|its|him|them|then|and|but|still)\b/i;

/**
 * An action keeps only what the actor does (the operator, 2026-11-22: "this should be action 'blinks
 * slowly' and the rest should be narration. But it all got crammed into barkeep action"): its first
 * sentence, and the ones after it that are still about them (a pronoun, their name, or a verb going
 * on). From the first sentence about someone or something else, the rest is narration.
 */
export function actionApart(line: ShownLine): ShownLine[] {
  if (line.kind !== 'do') return [line];
  const sentences =
    line.text
      .match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)\s*/g)
      ?.map((one) => one.trim())
      .filter(Boolean) ?? [];
  if (sentences.length < 2) return [line];
  const first = line.speaker.split(/\s+/).find((word) => /^\p{Lu}/u.test(word) && !/^(?:The|A|An)$/.test(word)) ?? '';
  const ownedBy = (sentence: string) =>
    ACTOR_WORDS.test(sentence) ||
    /^\p{Ll}/u.test(sentence) ||
    (first !== '' && sentence.startsWith(first)) ||
    sentence.toLowerCase().startsWith(line.speaker.toLowerCase());
  const cut = sentences.findIndex((sentence, index) => index > 0 && !ownedBy(sentence));
  if (cut === -1) return [line];
  return [
    { ...line, text: sentences.slice(0, cut).join(' ') },
    { kind: 'narrate', text: sentences.slice(cut).join(' ') },
  ];
}
