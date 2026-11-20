// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { QuickReplyManager } from '~/components/manage/QuickReplyManager';

export default function QuickRepliesPage(): ReactNode {
  return (
    <AppPage title='Quick replies' heading='Quick replies' width='medium'>
      <QuickReplyManager />
    </AppPage>
  );
}
