'use client';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ReactNode, useEffect } from 'react';
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
  // A deploy replaces the app's code under an open page (the operator, 2026-11-21: a line saved but
  // never shown or answered after a ship): the first chunk that fails to load reloads the page, once.
  useEffect(() => {
    const reloadOnce = (reason: unknown) => {
      const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
      if (
        !/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
          text,
        )
      )
        return;
      try {
        if (sessionStorage.getItem('rpg-ai-reloaded') === '1') return;
        sessionStorage.setItem('rpg-ai-reloaded', '1');
      } catch {
        // No storage: reload anyway.
      }
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => reloadOnce(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reloadOnce(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // A page that loaded fine clears the once-guard for the next deploy.
    const clear = window.setTimeout(() => {
      try {
        sessionStorage.removeItem('rpg-ai-reloaded');
      } catch {
        // Nothing to clear.
      }
    }, 10_000);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.clearTimeout(clear);
    };
  }, []);
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
