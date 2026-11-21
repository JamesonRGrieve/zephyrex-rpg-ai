// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/features/data/records', () => ({ campaigns: { useOne: () => ({ data: undefined }) } }));
vi.mock('~/features/capabilities', () => ({ useCapabilities: () => ({ world: true }) }));

const { scenePicture } = await import('./useSceneBackground');

const TOWER = { id: 'w-tower', kind: 'location', name: 'Gull Tower', aliases: [], picture: '/tower.png', deleted: false };
const DOCKS = {
  id: 'w-docks',
  kind: 'location',
  name: 'the Docks',
  aliases: ['harbour'],
  picture: '/docks.png',
  deleted: false,
};
const CELLAR = { id: 'w-cellar', kind: 'location', name: 'Cellar', aliases: [], picture: null, deleted: false };

describe('scenePicture', () => {
  it('shows the picture of the place the latest story line names', () => {
    const lines = [
      { channel: 'story', text: 'They leave the Gull Tower.' },
      { channel: 'story', text: 'At the harbour, gulls scream.' },
    ];
    expect(scenePicture(lines, [TOWER, DOCKS])).toBe('/docks.png');
  });

  it('ignores table talk, places without a picture and deleted places', () => {
    expect(scenePicture([{ channel: 'table', text: 'Gull Tower is cool' }], [TOWER])).toBeNull();
    expect(scenePicture([{ channel: 'story', text: 'Down to the Cellar.' }], [CELLAR])).toBeNull();
    expect(scenePicture([{ channel: 'story', text: 'Back to Gull Tower.' }], [{ ...TOWER, deleted: true }])).toBeNull();
  });
});
