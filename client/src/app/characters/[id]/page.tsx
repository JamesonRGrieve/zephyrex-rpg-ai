// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { CharacterEditor } from '~/components/characters/CharacterEditor';
import { AppPage } from '~/components/common/AppPage';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AppPage title='Character' heading='Edit character' width='medium'>
      <CharacterEditor id={id} />
    </AppPage>
  );
}
