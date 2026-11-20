// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from 'zephyrex/ui/sidebar';
import { AppPage } from './AppPage';

describe('AppPage', () => {
  it('gives the body its one h1 through the framework’s PageHeader', () => {
    render(
      <SidebarProvider>
        <AppPage title='Play' heading='Your chats' description='Every story you have going.'>
          <p>Body</p>
        </AppPage>
      </SidebarProvider>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Your chats' })).toBeInTheDocument();
    expect(screen.getByText('Every story you have going.')).toBeInTheDocument();
  });

  it('leaves the h1 to a page that renders its own', () => {
    render(
      <SidebarProvider>
        <AppPage title='Chat' heading={null}>
          <h1>Chat</h1>
        </AppPage>
      </SidebarProvider>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
