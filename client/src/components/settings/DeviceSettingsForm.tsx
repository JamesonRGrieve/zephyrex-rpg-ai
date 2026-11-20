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
import type { DeviceSettings, TierChoice } from '~/features/settings/deviceSettings';

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
        <p className='text-sm text-muted-foreground'>{measured === null ? 'Measuring this device…' : `This device measured as ${TIER_NAME[measured]}.`}</p>
        <div role='radiogroup' aria-label='Device setting' className='grid gap-2 sm:grid-cols-2'>
          {TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type='button'
              role='radio'
              aria-checked={settings.tier === option.value}
              onClick={() => onChange({ tier: option.value })}
              className={cn('flex min-h-16 flex-col items-start rounded-lg border p-3 text-left', settings.tier === option.value && 'border-primary bg-primary/10')}
            >
              <span className='font-medium'>{option.label}</span>
              <span className='text-xs text-muted-foreground'>{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className='flex min-h-11 items-center justify-between gap-3'>
        <div>
          <Label htmlFor={tableTalkId}>Show table talk in chats</Label>
          <p className='text-xs text-muted-foreground'>Out-of-character messages, shown apart from the story.</p>
        </div>
        <Switch id={tableTalkId} checked={settings.showTableTalk} onCheckedChange={(checked) => onChange({ showTableTalk: checked })} />
      </div>
    </div>
  );
}
