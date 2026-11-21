// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A character's sheet during play (the operator, 2026-11-21: "I can't find my character sheet in the
 * session"): the VTT's read-only CharacterSheet for one of the chat's cast, the seat's character first.
 */
import { CharacterSheet } from '@zephyrex/vtt-play';
import { type ReactElement, useState } from 'react';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import type { Roller } from './RollSheet';

export function SheetPanel({
  open,
  onOpenChange,
  cast,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cast: readonly Roller[];
  initial: string | null;
}): ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  const who = cast.find((one) => one.id === (picked ?? initial)) ?? cast[0];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' className='max-h-[90dvh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>Character sheet</SheetTitle>
          <SheetDescription>{who?.name ?? 'Nobody in this chat yet.'}</SheetDescription>
        </SheetHeader>
        {who !== undefined && (
          <div className='grid gap-3 p-4'>
            {cast.length > 1 && (
              <div role='radiogroup' aria-label='Whose sheet' className='flex flex-wrap gap-2'>
                {cast.map((one) => (
                  <ChoiceChip key={one.id} checked={one.id === who.id} onClick={() => setPicked(one.id)}>
                    {one.name}
                  </ChoiceChip>
                ))}
              </div>
            )}
            <CharacterSheet key={who.id} personId={who.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
