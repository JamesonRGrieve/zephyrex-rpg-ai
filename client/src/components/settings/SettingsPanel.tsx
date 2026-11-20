// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import type { ReactElement } from 'react';
import { useDeviceSettings } from '~/features/settings/useDeviceSettings';
import { DeviceSettingsForm } from './DeviceSettingsForm';

export function SettingsPanel(): ReactElement {
  const { settings, measured, change } = useDeviceSettings();
  return <DeviceSettingsForm settings={settings} measured={measured} onChange={change} />;
}
