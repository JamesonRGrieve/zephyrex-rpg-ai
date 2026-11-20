// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { SettingsPanel } from '~/components/settings/SettingsPanel';

export default function SettingsPage(): ReactNode {
  return (
    <AppPage title='Settings' width='medium'>
      <h1 className='sr-only'>Settings</h1>
      <SettingsPanel />
    </AppPage>
  );
}
