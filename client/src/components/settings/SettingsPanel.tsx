// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import type { ReactElement } from 'react';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import { BackupPanel } from './BackupPanel';
import { CustomCss } from './CustomCss';
import { DeviceSettingsForm } from './DeviceSettingsForm';
import { ThemePicker } from './ThemePicker';

/** `theme`: the theme in force, as the server read it (see ThemePicker). */
export function SettingsPanel({ theme }: { theme?: string }): ReactElement {
  const { settings, measured, change } = useDeviceSettings();
  return (
    <div className='grid gap-10'>
      <ThemePicker initialTheme={theme} />
      <DeviceSettingsForm settings={settings} measured={measured} onChange={change} />
      <CustomCss />
      <BackupPanel />
    </div>
  );
}
