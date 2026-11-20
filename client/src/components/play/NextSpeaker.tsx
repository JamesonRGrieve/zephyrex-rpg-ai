// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Who answers next in a group chat (A10): the cast's order by default ("In turn", naming who that
 * is), or a character the person picks for the next reply only.
 */
import type { ReactElement } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';

const CHIP = 'h-9 shrink-0';

export function NextSpeaker({
  cast,
  picked,
  upNext,
  onPick,
}: {
  cast: readonly { id: string; name: string }[];
  picked: string | null;
  /** Whose turn it is by the cast's order. */
  upNext: string | null;
  onPick: (id: string | null) => void;
}): ReactElement {
  const inTurn = cast.find((one) => one.id === upNext)?.name;
  return (
    <div className='mx-auto w-full max-w-3xl px-3'>
      <div
        ref={chipGroup}
        role='radiogroup'
        aria-label='Next to speak'
        className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-2'
      >
        <ChoiceChip checked={picked === null} className={CHIP} onClick={() => onPick(null)}>
          In turn{inTurn === undefined ? '' : ` (${inTurn})`}
        </ChoiceChip>
        {cast.map((one) => (
          <ChoiceChip
            key={one.id}
            checked={picked === one.id}
            className={CHIP}
            onClick={() => onPick(picked === one.id ? null : one.id)}
          >
            {one.name}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}
