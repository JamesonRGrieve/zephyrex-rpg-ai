// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { ZephyrexProvider } from 'zephyrex';
import { SidebarProvider } from 'zephyrex/ui/sidebar';
import config from '~/zephyrex.config';
import { AppPage } from './AppPage';

const meta: Meta<typeof AppPage> = {
  title: 'Common/App page',
  component: AppPage,
  tags: ['autodocs'],
  // The app's own frame: the framework's config (its no-script menu reads it) and the sidebar.
  decorators: [
    (Story) => (
      <ZephyrexProvider config={config}>
        <SidebarProvider>{Story()}</SidebarProvider>
      </ZephyrexProvider>
    ),
  ],
  args: {
    title: 'Chats',
    heading: 'Your chats',
    description: 'Every story you have going, the latest first.',
    children: <p>The chats go here.</p>,
  },
};
export default meta;
type Story = StoryObj<typeof AppPage>;

export const Wide: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The provider's frame may add a banner of its own; the page's is the one titled.
    await expect(canvas.getAllByRole('banner').some((banner) => banner.textContent?.includes('Chats'))).toBe(true);
    // The body's PageHeader is the page's one h1; the sidebar title is chrome.
    await expect(canvas.getByRole('heading', { level: 1, name: 'Your chats' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  },
};

export const Narrow: Story = { args: { width: 'narrow', title: 'Settings', heading: 'Settings', description: undefined } };

/** A page that renders its own h1 (the open chat): no PageHeader. */
export const OwnHeading: Story = {
  args: { heading: null, children: <h1 className='sr-only'>Chat</h1> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('heading', { level: 1 })).toHaveLength(1);
  },
};

/**
 * The header carries the button that opens the navigation on a phone (CSS shows it below the
 * `md` width only, so it is looked for whatever the viewport the story runs at).
 */
export const Phone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const banners = within(canvasElement).getAllByRole('banner');
    const toggles = banners.flatMap((banner) =>
      within(banner).queryAllByRole('button', { name: 'Toggle Sidebar', hidden: true }),
    );
    await expect(toggles.length).toBeGreaterThan(0);
  },
};
