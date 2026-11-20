// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { DataBankManager } from '~/components/manage/DataBankManager';

export default function DataBankPage(): ReactNode {
  return (
    <AppPage title='Data bank' width='medium'>
      <h1 className='sr-only'>Data bank</h1>
      <DataBankManager />
    </AppPage>
  );
}
