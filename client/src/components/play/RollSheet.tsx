// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Rolling at the table (docs/DESIGN.md, Real mechanics): the VTT's dice tray, for one of the
 * chat's cast. The VTT rolls on the server under the campaign's rules pack (a test of a
 * characteristic or skill) or a dice formula, and shows the 3D dice; the result comes back as a
 * line on the `roll` channel, a mechanical fact the story reads. The model never makes up a roll.
 */
import { DiceTray, type RollResult, type TestResult } from '@zephyrex/vtt-play';
import { type ReactElement, useState } from 'react';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';

export interface Roller {
  id: string;
  name: string;
}

/** The roll line: who rolled, and the result as the tray reports it. */
export function rollLine(name: string, result: TestResult | RollResult): string {
  if (!('degrees' in result)) return `${name} rolls ${result.formula}: ${result.total}.`;
  const outcome = result.success ? 'succeeds' : 'fails';
  const degrees = `${result.degrees} degree${result.degrees === 1 ? '' : 's'}`;
  const natural = result.natural ? `, a natural ${result.natural === 'success' ? '1' : '100'}` : '';
  return `${name} ${outcome}: rolled ${result.roll} against ${result.target}, ${degrees}${natural}.`;
}

export function RollSheet({
  open,
  onOpenChange,
  rollers,
  initial,
  onRolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who can roll: the chat's cast. */
  rollers: readonly Roller[];
  /** Who rolls first: the seat's character, or the first of the cast. */
  initial: string | null;
  onRolled: (line: string) => void;
}): ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  const who = rollers.find((one) => one.id === (picked ?? initial)) ?? rollers[0];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='bottom' className='max-h-[90dvh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>Roll</SheetTitle>
          <SheetDescription>A test under the campaign&apos;s rules, or a dice formula. The VTT rolls it.</SheetDescription>
        </SheetHeader>
        {who === undefined ? (
          <p className='p-4 text-sm text-muted-foreground'>Nobody in this chat can roll yet.</p>
        ) : (
          <div className='grid gap-3 p-4'>
            {rollers.length > 1 && (
              <div role='radiogroup' aria-label='Who rolls' className='flex flex-wrap gap-2'>
                {rollers.map((one) => (
                  <ChoiceChip key={one.id} checked={one.id === who.id} onClick={() => setPicked(one.id)}>
                    {one.name}
                  </ChoiceChip>
                ))}
              </div>
            )}
            <DiceTray key={who.id} personId={who.id} onResult={(result) => onRolled(rollLine(who.name, result))} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
