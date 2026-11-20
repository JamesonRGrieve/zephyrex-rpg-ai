// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { SidebarProvider } from 'zephyrex/ui/sidebar';
import { AppPage } from './AppPage';

const meta: Meta<typeof AppPage> = {
  title: 'Common/App page',
  component: AppPage,
  tags: ['autodocs'],
  decorators: [(Story) => <SidebarProvider>{Story()}</SidebarProvider>],
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
    await expect(canvas.getByRole('banner')).toHaveTextContent('Chats');
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
    const header = within(within(canvasElement).getByRole('banner'));
    await expect(header.getByRole('button', { name: 'Toggle Sidebar', hidden: true })).toBeInTheDocument();
  },
};
