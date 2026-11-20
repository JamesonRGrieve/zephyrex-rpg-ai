// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { QuickReplyFormView } from './QuickReplyManager';

const meta: Meta<typeof QuickReplyFormView> = {
  title: 'Manage/Quick reply form',
  component: QuickReplyFormView,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: { reply: null, onSave: fn(async () => null), done: fn() },
};
export default meta;
type Story = StoryObj<typeof QuickReplyFormView>;

/** A new quick reply. One that runs after each reply can only fill the composer. */
export const New: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'After each reply' }));
    await expect(canvas.getByRole('radio', { name: 'Fill in to edit' })).toHaveAttribute('aria-checked', 'true');
  },
};

/** Editing one that opens every chat with a line of table talk. */
export const OnOpening: Story = {
  args: {
    reply: {
      id: 'q1',
      created_at: 'x',
      updated_at: null,
      label: 'Recap',
      message: 'Where were we?',
      action: 'send',
      channel: 'ooc',
      enabled: true,
      position: 0,
      auto_run: 'chat_open',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'When a chat opens' })).toHaveAttribute('aria-checked', 'true');
  },
};
