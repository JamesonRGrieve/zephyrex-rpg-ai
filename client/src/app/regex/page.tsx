// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { RegexManager } from '~/components/manage/RegexManager';

export default function RegexPage(): ReactNode {
  return (
    <AppPage title='Regex' heading='Regex scripts' width='medium'>
      <RegexManager />
    </AppPage>
  );
}
