// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The seat picker (docs/DESIGN.md, The play model): who the person is right now, swapped at any
 * time, in the session's top bar. The GM, or any character at all: the party first, then everyone
 * else (an NPC taken over joins the party while played). The AI plays everyone the person doesn't.
 */
import { Crown } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from 'zephyrex/ui/popover';
import { cn } from '~/lib/utils';

export interface SeatCharacter {
  id: string;
  name: string;
  avatar: string | null;
  /** A traditional player character (wiki kind `pc`); anyone else is listed as an NPC. */
  pc?: boolean;
  /** Who they are, in a line (the wiki's summary). */
  line?: string;
}

/**
 * The seats as the picker lists them (the operator, 2026-11-21: separate the player characters
 * from the NPCs, for other ways to play): the player characters, then the NPCs, each in seat order.
 */
export function seatGroups<C extends { pc?: boolean }>(ordered: readonly C[]): { label: string; members: C[] }[] {
  return [
    { label: 'Player characters', members: ordered.filter((one) => one.pc === true) },
    { label: 'NPCs', members: ordered.filter((one) => one.pc !== true) },
  ].filter((group) => group.members.length > 0);
}

/** The person's seat: the GM (null), or the id of the character they play. */
export type SeatChoice = string | null;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The choices in order: the party, then every other character, each once. */
export function seatOrder<C extends { id: string }>(party: readonly C[], everyone: readonly C[]): C[] {
  const inParty = new Set(party.map((character) => character.id));
  return [...party, ...everyone.filter((character) => !inParty.has(character.id))];
}

export function SeatPicker({
  seat,
  party,
  everyone,
  onChange,
}: {
  seat: SeatChoice;
  party: readonly SeatCharacter[];
  everyone: readonly SeatCharacter[];
  onChange: (seat: SeatChoice) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const all = seatOrder(party, everyone);
  const current = all.find((character) => character.id === seat) ?? null;
  const inParty = new Set(party.map((character) => character.id));
  const shown = all.filter((character) => character.name.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (next: SeatChoice) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' className='h-11 max-w-56 gap-2'>
          <span aria-hidden className='flex shrink-0'>
            {current === null ? (
              <Crown />
            ) : (
              <Avatar className='size-6'>
                {current.avatar !== null && <AvatarImage src={current.avatar} alt='' />}
                <AvatarFallback className='text-[10px]'>{initials(current.name)}</AvatarFallback>
              </Avatar>
            )}
          </span>
          <span className='max-w-24 truncate max-sm:max-w-16'>
            <span className='sr-only'>Your seat: </span>
            {current?.name ?? 'the GM'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='grid w-72 gap-2 p-2' aria-label='Choose your seat'>
        <Input
          aria-label='Find a character'
          placeholder='Find a character'
          className='h-11'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul aria-label='Seats' className='grid max-h-80 gap-1 overflow-y-auto'>
          <li>
            <button
              type='button'
              aria-pressed={seat === null}
              onClick={() => choose(null)}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent',
                seat === null && 'bg-accent',
              )}
            >
              <Crown className='size-5' aria-hidden /> <span className='font-medium'>The GM</span>
            </button>
          </li>
          {seatGroups(shown).flatMap((group) => [
            <li
              key={`group-${group.label}`}
              role='presentation'
              className='px-2 pt-2 text-xs font-semibold text-muted-foreground'
            >
              {group.label}
            </li>,
            ...group.members.map((character) => (
              <li key={character.id}>
                <button
                  type='button'
                  aria-pressed={seat === character.id}
                  onClick={() => choose(character.id)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent',
                    seat === character.id && 'bg-accent',
                  )}
                >
                  <span aria-hidden className='flex shrink-0'>
                    <Avatar className='size-7'>
                      {character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
                      <AvatarFallback className='text-[10px]'>{initials(character.name)}</AvatarFallback>
                    </Avatar>
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate'>{character.name}</span>
                    {character.line !== undefined && character.line !== '' && (
                      <span className='line-clamp-2 block text-xs text-muted-foreground'>{character.line}</span>
                    )}
                  </span>
                  {inParty.has(character.id) && <span className='text-xs text-muted-foreground'>Party</span>}
                </button>
              </li>
            )),
          ])}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
