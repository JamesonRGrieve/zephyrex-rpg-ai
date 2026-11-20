// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { PresetManager } from '~/components/manage/PresetManager';

export default function PresetsPage(): ReactNode {
  return (
    <AppPage title='Presets' heading='Sampler presets' width='medium'>
      <PresetManager />
    </AppPage>
  );
}
