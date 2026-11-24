// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { Landing } from './Landing';

const meta: Meta<typeof Landing> = {
  title: 'Landing/Landing',
  component: Landing,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof Landing>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Characters who know your world' })).toBeInTheDocument();
    await expect(canvas.getByRole('table')).toBeInTheDocument();
  },
};

/** The landing page at phone width: the header folds into its menu. */
export const Phone: Story = {
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Menu')).toBeInTheDocument();
  },
};

/** The hosted build: the hero's way in is the waitlist, and sign-in sits in the header. */
export const Hosted: Story = {
  args: { start: { label: 'Join the waitlist', href: '/waitlist' }, signIn: { label: 'Sign in', href: '/user' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('link', { name: 'Join the waitlist' })[0]).toHaveAttribute('href', '/waitlist');
    await expect(canvas.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/user');
    await expect(canvas.queryByRole('link', { name: /sign up|register/i })).toBeNull();
  },
};
