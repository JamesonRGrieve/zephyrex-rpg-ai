// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ZephyrexProvider } from 'zephyrex';
import { SidebarProvider } from 'zephyrex/ui/sidebar';
import config from '~/zephyrex.config';
import { AppPage } from './AppPage';

/** The app's own frame: the framework's config (its no-script menu reads it) and the sidebar. */
function Frame({ children }: { children: ReactNode }): ReactNode {
  return (
    <ZephyrexProvider config={config}>
      <SidebarProvider>{children}</SidebarProvider>
    </ZephyrexProvider>
  );
}

describe('AppPage', () => {
  it('gives the body its one h1 through the framework’s PageHeader', () => {
    render(
      <Frame>
        <AppPage title='Play' heading='Your chats' description='Every story you have going.'>
          <p>Body</p>
        </AppPage>
      </Frame>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Your chats' })).toBeInTheDocument();
    expect(screen.getByText('Every story you have going.')).toBeInTheDocument();
  });

  it('leaves the h1 to a page that renders its own', () => {
    render(
      <Frame>
        <AppPage title='Chat' heading={null}>
          <h1>Chat</h1>
        </AppPage>
      </Frame>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
