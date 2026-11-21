// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { AppPage } from '~/components/common/AppPage';
import { ScenarioManager } from '~/components/manage/ScenarioManager';

/** `?edit=<id>` opens that prep sheet's editor (a scenario page's Prep links here). */
export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { edit } = await searchParams;
  return (
    <AppPage title='Prep sheets' heading='Prep sheets' width='medium'>
      <ScenarioManager openId={typeof edit === 'string' ? edit : null} />
    </AppPage>
  );
}
