// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import type { ReactElement } from 'react';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import { BackupPanel } from './BackupPanel';
import { DeviceSettingsForm } from './DeviceSettingsForm';
import { ThemePicker } from './ThemePicker';

export function SettingsPanel(): ReactElement {
  const { settings, measured, change } = useDeviceSettings();
  return (
    <div className='grid gap-10'>
      <ThemePicker />
      <DeviceSettingsForm settings={settings} measured={measured} onChange={change} />
      <BackupPanel />
    </div>
  );
}
