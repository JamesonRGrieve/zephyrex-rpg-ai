// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { SessionZeroPage } from '~/components/campaign/SessionZero';
import { AppPage } from '~/components/common/AppPage';

export default function SessionZeroRoute(): ReactNode {
  return (
    <AppPage title='Session zero' heading='Session zero' width='medium'>
      <SessionZeroPage />
    </AppPage>
  );
}
