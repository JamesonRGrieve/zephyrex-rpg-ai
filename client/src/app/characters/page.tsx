// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { CharacterGallery } from '~/components/characters/CharacterGallery';
import { AppPage } from '~/components/common/AppPage';

export default function CharactersPage(): ReactNode {
  return (
    <AppPage title='Characters'>
      <h1 className='sr-only'>Characters</h1>
      <CharacterGallery />
    </AppPage>
  );
}
