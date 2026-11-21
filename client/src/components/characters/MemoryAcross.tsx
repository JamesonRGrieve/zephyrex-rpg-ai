// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { type ReactElement, useId } from 'react';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';

/**
 * A character's memory across chats (AP8): whether its replies may recall what happened in the
 * person's other chats it was in (features/memory/across.ts). Only the person's own chats.
 */
export function MemoryAcross({
  name,
  value,
  onChange,
}: {
  name: string;
  value: boolean;
  onChange: (on: boolean) => void;
}): ReactElement {
  const switchId = useId();
  const hintId = useId();
  return (
    <div className='grid min-w-0 gap-1 rounded-lg border p-3'>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <Label htmlFor={switchId}>Remember across chats</Label>
        <Switch id={switchId} checked={value} onCheckedChange={onChange} aria-describedby={hintId} />
      </div>
      <p id={hintId} className='text-sm text-muted-foreground'>
        {name} may recall what happened in your other chats together. Only yours, never anyone else’s; needs a model set to
        embed (Models).
      </p>
    </div>
  );
}
