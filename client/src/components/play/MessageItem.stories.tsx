// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ADA_REPLY, TABLE_TALK, USER_LINE } from './fixtures';
import { MessageItem } from './MessageItem';

const meta: Meta<typeof MessageItem> = {
  title: 'Play/Message',
  component: MessageItem,
  decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>],
  args: { message: ADA_REPLY, onSwipe: fn(), onRegenerate: fn(), onFork: fn(), onEdit: fn(), onBookmark: fn(), onBranch: fn(), onDelete: fn() },
};
export default meta;
type Story = StoryObj<typeof MessageItem>;

/** A character's reply: actions in italics, two alternatives to page through. */
export const Reply: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('wipes her hands on a rag').tagName).toBe('EM');
    await userEvent.click(canvas.getByRole('button', { name: 'Next reply' }));
    await expect(args.onSwipe).toHaveBeenCalledWith(1);
  },
};

/** The last alternative offers another. */
export const LastSwipe: Story = {
  args: { message: { ...ADA_REPLY, swipe: { index: 1, count: 2 } } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Write another reply' }));
    await expect(args.onRegenerate).toHaveBeenCalled();
  },
};

/** A message at a fork pages between branches. */
export const AtAFork: Story = { args: { message: USER_LINE } };

/** Out-of-character table talk sits in its own lane. */
export const TableTalk: Story = {
  args: { message: TABLE_TALK },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Table talk')).toBeInTheDocument();
  },
};

export const Writing: Story = { args: { message: { ...ADA_REPLY, text: '' }, writing: true } };

/** A reasoning model's thinking, folded under the reply's name until asked for. */
export const WithReasoning: Story = {
  args: { message: { ...ADA_REPLY, text: '<think>Sam looks lost; keep it short.</think>Mind the coolant, friend.' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sam looks lost; keep it short.')).not.toBeVisible();
    await userEvent.click(canvas.getByText('Thinking'));
    await expect(canvas.getByText('Sam looks lost; keep it short.')).toBeVisible();
  },
};

/** Bubbles: your lines on the right, in the accent colour (A49). */
export const Bubbles: Story = {
  args: { message: USER_LINE, layout: 'bubbles' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('article')).toHaveClass('flex-row-reverse');
  },
};

/** Document: no portraits, the story as running text (A49). */
export const Document: Story = {
  args: { layout: 'document' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('AV')).not.toBeInTheDocument();
  },
};


const hideTranslation = fn();

/** A translation under the reply (A43), with a way to hide it. */
export const Translated: Story = {
  args: { translation: { status: 'done', text: '*s’essuie les mains* Bienvenue à bord.', onHide: hideTranslation } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Hide translation' }));
    await expect(hideTranslation).toHaveBeenCalled();
  },
};
