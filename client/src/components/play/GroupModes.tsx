// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A group chat's modes (audit gap 6), as SillyTavern's group settings: whose card the model reads
 * (the speaker's, or every member's joined), the turn order (natural, list or pooled), whether
 * natural order may give the floor back to who just spoke, auto-reply after a quiet spell, and a
 * group scenario in place of each card's.
 */
import { type ReactElement, useId } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { Textarea } from 'zephyrex/ui/textarea';
import { GROUP_SETTINGS } from '~/contract';
import type { GroupSettings } from '~/features/chat/groupSettings';

const CARD_LABELS = { swap: 'The speaker’s card', join: 'Every member’s card' } as const;
const ORDER_LABELS = { natural: 'Natural', list: 'In order', pooled: 'Everyone once' } as const;
const ORDER_HINTS = {
  natural: 'Whoever the last line names speaks next; otherwise the most talkative.',
  list: 'Each member in the cast’s order.',
  pooled: 'Everyone speaks once after your line before anyone speaks twice.',
} as const;
const CHIP = 'h-11 px-4';

export function GroupModes({
  value,
  onChange,
}: {
  value: GroupSettings;
  onChange: (next: GroupSettings) => void;
}): ReactElement {
  const ids = {
    cards: useId(),
    order: useId(),
    self: useId(),
    auto: useId(),
    scenario: useId(),
    prefix: useId(),
    suffix: useId(),
  };
  const set = <K extends keyof GroupSettings>(key: K, next: GroupSettings[K]) => onChange({ ...value, [key]: next });
  const cardMode = value.card_mode ?? 'swap';
  const order = value.order ?? 'natural';
  const [low, high] = GROUP_SETTINGS.auto_seconds;
  return (
    <fieldset className='grid gap-4 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>Group</legend>
      <div className='grid gap-2'>
        <span id={ids.cards} className='text-sm'>
          The model reads
        </span>
        <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.cards} className='flex flex-wrap gap-2'>
          {GROUP_SETTINGS.card_modes.map((mode) => (
            <ChoiceChip key={mode} checked={cardMode === mode} className={CHIP} onClick={() => set('card_mode', mode)}>
              {CARD_LABELS[mode]}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {cardMode === 'join' && (
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.prefix}>Before each card</Label>
            <Input
              id={ids.prefix}
              className='h-11 font-mono text-sm'
              maxLength={GROUP_SETTINGS.affix_characters}
              value={value.join_prefix ?? GROUP_SETTINGS.join_prefix}
              onChange={(event) => set('join_prefix', event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.suffix}>After each card</Label>
            <Input
              id={ids.suffix}
              className='h-11 font-mono text-sm'
              maxLength={GROUP_SETTINGS.affix_characters}
              value={value.join_suffix ?? GROUP_SETTINGS.join_suffix}
              onChange={(event) => set('join_suffix', event.target.value)}
            />
          </div>
        </div>
      )}
      <div className='grid gap-2'>
        <span id={ids.order} className='text-sm'>
          Turn order
        </span>
        <div
          ref={chipGroup}
          role='radiogroup'
          aria-labelledby={ids.order}
          aria-describedby={`${ids.order}-hint`}
          className='flex flex-wrap gap-2'
        >
          {GROUP_SETTINGS.orders.map((mode) => (
            <ChoiceChip key={mode} checked={order === mode} className={CHIP} onClick={() => set('order', mode)}>
              {ORDER_LABELS[mode]}
            </ChoiceChip>
          ))}
        </div>
        <p id={`${ids.order}-hint`} className='text-xs text-muted-foreground'>
          {ORDER_HINTS[order]}
        </p>
      </div>
      {order === 'natural' && (
        <div className='flex min-h-11 items-center justify-between gap-3'>
          <Label htmlFor={ids.self}>Let a member answer themself</Label>
          <Switch id={ids.self} checked={value.allow_self ?? false} onCheckedChange={(next) => set('allow_self', next)} />
        </div>
      )}
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.auto}>Reply by themselves after (seconds)</Label>
        <p id={`${ids.auto}-hint`} className='text-xs text-muted-foreground'>
          The next member speaks when the chat has been quiet this long. 0 is off.
        </p>
        <Input
          id={ids.auto}
          type='number'
          inputMode='numeric'
          min={low}
          max={high}
          className='h-11'
          aria-describedby={`${ids.auto}-hint`}
          value={String(value.auto_seconds ?? 0)}
          onChange={(event) => {
            const seconds = Number.parseInt(event.target.value, 10);
            set('auto_seconds', Number.isNaN(seconds) ? 0 : Math.min(high, Math.max(low, seconds)));
          }}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={ids.scenario}>Group scenario</Label>
        <p id={`${ids.scenario}-hint`} className='text-xs text-muted-foreground'>
          Replaces each character’s own scenario in this chat. Leave it blank to keep theirs.
        </p>
        <Textarea
          id={ids.scenario}
          rows={3}
          maxLength={GROUP_SETTINGS.scenario_characters}
          aria-describedby={`${ids.scenario}-hint`}
          value={value.scenario ?? ''}
          onChange={(event) => set('scenario', event.target.value)}
        />
      </div>
    </fieldset>
  );
}
