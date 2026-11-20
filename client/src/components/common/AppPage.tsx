// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { SidebarHeader, SidebarHeaderTitle } from 'zephyrex/components/appwrapper/src/SidebarHeader';
import { PageHeader } from 'zephyrex/ui/page-header';
import { SidebarInset } from 'zephyrex/ui/sidebar';
import { cn } from '~/lib/utils';

const WIDTHS = { narrow: 'max-w-md', medium: 'max-w-3xl', wide: 'max-w-6xl' } as const;

/**
 * One of the app's pages: the framework's sidebar header (the page's name, and on a phone the
 * button that opens the navigation) above the page's content, at a width that suits it. The body
 * owns the page's one h1: the framework's PageHeader with `heading` (and a `description`), unless
 * `heading` is null and the page renders its own (the open chat, which keeps the space for talk).
 */
export function AppPage({
  title,
  heading,
  description,
  width = 'wide',
  children,
}: {
  title: string;
  heading: string | null;
  description?: ReactNode;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}): ReactNode {
  return (
    <SidebarInset className='min-h-svh min-w-0'>
      <SidebarHeader>
        <SidebarHeaderTitle>{title}</SidebarHeaderTitle>
      </SidebarHeader>
      <div className={cn('mx-auto grid w-full min-w-0 gap-6 px-4 pb-8 pt-2', WIDTHS[width])}>
        {heading !== null && <PageHeader title={heading} description={description} />}
        <div className='min-w-0'>{children}</div>
      </div>
    </SidebarInset>
  );
}
