// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * This device's settings. The tier decides how much heavy work (maps, effects, local models) the
 * device takes on; "Automatic" uses what it measured. Every feature works at every tier.
 */
import { type ReactElement, useId } from 'react';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';
import { cn } from '~/lib/utils';
import type { DeviceTier } from '~/features/device/tier';
import {
  CHAT_LAYOUTS,
  type ChatLayout,
  type DeviceSettings,
  TEXT_SIZES,
  type TextSize,
  type TierChoice,
} from '~/features/settings/deviceSettings';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';

const LAYOUT_LABELS: Record<ChatLayout, string> = { flat: 'Flat', bubbles: 'Bubbles', document: 'Document' };
const SIZE_LABELS: Record<TextSize, string> = { small: 'Small', normal: 'Normal', large: 'Large', larger: 'Larger' };
const CHIP =
  'h-11 rounded-full border px-4 text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground';

const TIER_OPTIONS: { value: TierChoice; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatic', hint: 'Use what this device can do' },
  { value: 'strong', label: 'Full', hint: 'Every effect, and models in the browser where possible' },
  { value: 'standard', label: 'Balanced', hint: 'Lighter effects; models on the server' },
  { value: 'light', label: 'Light', hint: 'Simplest drawing, least battery and data' },
];

const TIER_NAME: Record<DeviceTier, string> = { strong: 'Full', standard: 'Balanced', light: 'Light' };

export function DeviceSettingsForm({
  settings,
  measured,
  onChange,
}: {
  settings: DeviceSettings;
  measured: DeviceTier | null;
  onChange: (next: Partial<DeviceSettings>) => void;
}): ReactElement {
  const tableTalkId = useId();
  return (
    <div className='grid gap-8'>
      <fieldset className='grid gap-3'>
        <legend className='text-lg font-semibold'>How much this device does</legend>
        <p className='text-sm text-muted-foreground'>
          {measured === null ? 'Measuring this device…' : `This device measured as ${TIER_NAME[measured]}.`}
        </p>
        <div role='radiogroup' aria-label='Device setting' className='grid gap-2 sm:grid-cols-2'>
          {TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type='button'
              role='radio'
              aria-checked={settings.tier === option.value}
              onClick={() => onChange({ tier: option.value })}
              className={cn(
                'flex min-h-16 flex-col items-start rounded-lg border p-3 text-left',
                settings.tier === option.value && 'border-primary bg-primary/10',
              )}
            >
              <span className='font-medium'>{option.label}</span>
              <span className='text-xs text-muted-foreground'>{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className='grid gap-3'>
        <legend className='text-lg font-semibold'>How chats look here</legend>
        <div className='grid gap-2'>
          <span id={`${tableTalkId}-layout`} className='text-sm font-medium'>
            Layout
          </span>
          <div ref={chipGroup} role='radiogroup' aria-labelledby={`${tableTalkId}-layout`} className='flex flex-wrap gap-2'>
            {CHAT_LAYOUTS.map((layout) => (
              <ChoiceChip
                key={layout}
                checked={settings.chatLayout === layout}
                className={CHIP}
                onClick={() => onChange({ chatLayout: layout })}
              >
                {LAYOUT_LABELS[layout]}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <div className='grid gap-2'>
          <span id={`${tableTalkId}-size`} className='text-sm font-medium'>
            Text size
          </span>
          <div ref={chipGroup} role='radiogroup' aria-labelledby={`${tableTalkId}-size`} className='flex flex-wrap gap-2'>
            {TEXT_SIZES.map((size) => (
              <ChoiceChip
                key={size}
                checked={settings.textSize === size}
                className={CHIP}
                onClick={() => onChange({ textSize: size })}
              >
                {SIZE_LABELS[size]}
              </ChoiceChip>
            ))}
          </div>
        </div>
      </fieldset>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <div>
          <Label htmlFor={`${tableTalkId}-sprites`}>Show expressions</Label>
          <p className='text-xs text-muted-foreground'>
            A character’s sprite for how their line feels, when they have sprites.
          </p>
        </div>
        <Switch
          id={`${tableTalkId}-sprites`}
          checked={settings.showExpressions}
          onCheckedChange={(checked) => onChange({ showExpressions: checked })}
        />
      </div>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <div>
          <Label htmlFor={`${tableTalkId}-read`}>Read replies aloud</Label>
          <p className='text-xs text-muted-foreground'>Each character in their own voice, on this device.</p>
        </div>
        <Switch
          id={`${tableTalkId}-read`}
          checked={settings.readAloud}
          onCheckedChange={(checked) => onChange({ readAloud: checked })}
        />
      </div>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <div>
          <Label htmlFor={tableTalkId}>Show table talk in chats</Label>
          <p className='text-xs text-muted-foreground'>Out-of-character messages, shown apart from the story.</p>
        </div>
        <Switch
          id={tableTalkId}
          checked={settings.showTableTalk}
          onCheckedChange={(checked) => onChange({ showTableTalk: checked })}
        />
      </div>
    </div>
  );
}
