// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MetadataRoute } from 'next';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, HOME_PATH } from '~/zephyrex.config';

const BACKGROUND = '#0c0910';

/** Installing the app from the browser: it opens on the chats, with shortcuts to the main screens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: HOME_PATH,
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: HOME_PATH,
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Chats', url: HOME_PATH },
      { name: 'Characters', url: '/characters' },
      { name: 'New chat', url: `${HOME_PATH}?new=1` },
    ],
  };
}
