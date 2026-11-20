// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactElement } from 'react';

/**
 * Zephyrex RPG AI's mark: a speech bubble holding a die's face, the voices at the table.
 * src/app/icon.svg is the same drawing in fixed colours, for the browser tab and the installed
 * app. Decorative: the app's name always stands beside it.
 */
export function RpgAiLogo(): ReactElement {
  return (
    <svg viewBox='0 0 32 32' className='size-8' aria-hidden>
      <rect width='32' height='32' rx='7' className='fill-primary' />
      <path
        d='M8 9.5h16a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-7l-4.5 3.5v-3.5H8A2.5 2.5 0 0 1 5.5 20v-8A2.5 2.5 0 0 1 8 9.5Z'
        fill='none'
        strokeWidth='1.8'
        strokeLinejoin='round'
        className='stroke-primary-foreground'
      />
      <path d='M16 11.6 20.2 14v4.4L16 20.8l-4.2-2.4V14Z' className='fill-primary-foreground' />
    </svg>
  );
}
