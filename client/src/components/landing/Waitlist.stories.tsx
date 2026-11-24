// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { Waitlist } from './Waitlist';

const meta: Meta<typeof Waitlist> = {
  title: 'Landing/Waitlist',
  component: Waitlist,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof Waitlist>;

/** The waitlist page: the form, and sign-in for someone with an account; never a sign-up link. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Accounts are waitlist only for now' })).toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    await expect(canvas.getAllByRole('link', { name: 'Sign in' })[0]).toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: /sign up|register/i })).toBeNull();
  },
};

/** At phone width the header folds into its menu and the form fills the width. */
export const Phone: Story = {
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Menu')).toBeInTheDocument();
  },
};
