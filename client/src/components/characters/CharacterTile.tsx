// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { Star } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'zephyrex/ui/avatar';
import { Badge } from 'zephyrex/ui/badge';
import { Button } from 'zephyrex/ui/button';
import type { Character } from '~/features/data/records';

/** The character's initials, for when there is no picture. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

/** One character in the gallery: picture, name, tags, and a tap target big enough for a thumb. */
export function CharacterTile({
  character,
  onToggleFavourite,
}: {
  character: Pick<Character, 'id' | 'name' | 'avatar' | 'tags' | 'favourite' | 'description'>;
  onToggleFavourite?: () => void;
}): ReactElement {
  return (
    <article aria-labelledby={`character-${character.id}`} className='relative flex flex-col gap-3 rounded-xl border p-4'>
      <Link href={`/characters/${character.id}`} className='flex min-h-11 items-center gap-3 after:absolute after:inset-0'>
        <Avatar className='size-14 shrink-0'>
          {character.avatar !== null && <AvatarImage src={character.avatar} alt='' />}
          <AvatarFallback>{initials(character.name)}</AvatarFallback>
        </Avatar>
        <h2 id={`character-${character.id}`} className='min-w-0 truncate text-base font-semibold'>
          {character.name}
        </h2>
      </Link>
      {character.description !== '' && <p className='line-clamp-2 text-sm text-muted-foreground'>{character.description}</p>}
      {character.tags.length > 0 && (
        <ul className='flex flex-wrap gap-1' aria-label='Tags'>
          {character.tags.slice(0, 4).map((tag) => (
            <li key={tag}>
              <Badge variant='secondary'>{tag}</Badge>
            </li>
          ))}
        </ul>
      )}
      {onToggleFavourite !== undefined && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='absolute top-2 right-2 z-10 size-11'
          aria-pressed={character.favourite}
          aria-label={character.favourite ? `Unfavourite ${character.name}` : `Favourite ${character.name}`}
          onClick={onToggleFavourite}
        >
          <Star className={character.favourite ? 'fill-primary text-primary' : ''} aria-hidden />
        </Button>
      )}
    </article>
  );
}
