// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { PresetManager } from '~/components/manage/PresetManager';

export default function PresetsPage(): ReactNode {
  return (
    <AppPage title='Presets' width='medium'>
      <h1 className='sr-only'>Sampler presets</h1>
      <PresetManager />
    </AppPage>
  );
}
