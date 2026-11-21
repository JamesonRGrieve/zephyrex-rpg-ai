// SPDX-License-Identifier: AGPL-3.0-or-later
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { SettingsPanel } from '~/components/settings/SettingsPanel';
import appConfig from '~/zephyrex.config';

export default async function SettingsPage(): Promise<ReactNode> {
  // The theme in force, read as the root layout reads it, so the picker's first render (on the
  // server, where the cookie can't be read from script) already marks it, not "light".
  const theme = (await cookies()).get('theme')?.value ?? appConfig.app.defaultTheme ?? 'dark';
  return (
    <AppPage title='Settings' heading='Settings' width='medium'>
      <SettingsPanel theme={theme} />
    </AppPage>
  );
}
