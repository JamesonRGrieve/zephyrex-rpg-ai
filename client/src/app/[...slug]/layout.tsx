// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { SidebarHeader, SidebarHeaderTitle } from 'zephyrex/components/appwrapper/src/SidebarHeader';
import { SidebarInset } from 'zephyrex/ui/sidebar';

/**
 * Pages the extensions serve (the wiki at /w, …): the same sidebar header as the app's own pages
 * (AppPage), so the navigation opens from them on a phone too (the operator, 2026-11-21: "Worlds
 * lost its left sidebar").
 */
export default function CatchAllLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarInset className='min-h-svh min-w-0'>
      <SidebarHeader>
        <SidebarHeaderTitle>Worlds</SidebarHeaderTitle>
      </SidebarHeader>
      <div className='min-w-0 p-4'>{children}</div>
    </SidebarInset>
  );
}
