'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { ZephyrexApp } from 'zephyrex';
import { SidebarContext } from 'zephyrex/components/appwrapper/src/SidebarContext';
import { SidebarMain } from 'zephyrex/components/appwrapper/src/SidebarMain';
import { CustomStyle } from '~/components/settings/CustomCss';
import config from '~/zephyrex.config';

/**
 * The framework shell and its sidebars, imported on the client: the config carries the logo
 * (a component), which a server layout cannot pass to a client component as a prop.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ZephyrexApp config={config}>
      <SidebarMain side='left' />
      {children}
      {/* The right-hand context pop-out, in an open chat (components/play/ContextPanel.tsx). */}
      <SidebarContext side='right' visibleOn={['/play/']} />
      <CustomStyle />
    </ZephyrexApp>
  );
}
