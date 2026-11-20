// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The folder filter as a row of chips: All, each folder in use, and No folder. Shared by the chat
 * library (A12) and the character gallery (A51); hidden while nothing is in a folder.
 */
import type { ReactElement } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import type { FolderFilter } from '~/features/chat/library';

const CHIP = 'h-9 shrink-0';

export function FolderChips({
  folders,
  value,
  onChange,
}: {
  folders: readonly string[];
  value: FolderFilter;
  onChange: (next: FolderFilter) => void;
}): ReactElement | null {
  if (folders.length === 0) return null;
  return (
    <div ref={chipGroup} role='radiogroup' aria-label='Folder' className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1'>
      <ChoiceChip checked={value.kind === 'all'} className={CHIP} onClick={() => onChange({ kind: 'all' })}>
        All
      </ChoiceChip>
      {folders.map((name) => (
        <ChoiceChip
          key={name}
          checked={value.kind === 'folder' && value.name === name}
          className={CHIP}
          onClick={() => onChange({ kind: 'folder', name })}
        >
          {name}
        </ChoiceChip>
      ))}
      <ChoiceChip checked={value.kind === 'none'} className={CHIP} onClick={() => onChange({ kind: 'none' })}>
        No folder
      </ChoiceChip>
    </div>
  );
}
