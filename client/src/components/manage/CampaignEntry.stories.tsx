// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CampaignEntry } from './CampaignEntry';

const meta: Meta<typeof CampaignEntry> = {
  title: 'Manage/CampaignEntry',
  component: CampaignEntry,
  args: {
    href: '/play/chat-1',
    name: 'Brenna Ashdown',
    title: 'Clusterfuck Express',
    line: 'The party has crossed to the drowned mill.',
    updated: '2026-11-24T15:25:54Z',
    onRename: fn(),
    onDelete: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof CampaignEntry>;

/** The character's name, then the player's own title; never the scenario's name. */
export const Titled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link')).toHaveTextContent('Brenna Ashdown · Clusterfuck Express');
    await expect(canvas.getByRole('button', { name: "Rename Brenna Ashdown's campaign" })).toBeInTheDocument();
  },
};

/** No title yet: only the character's name, and the pencil offers to name it. */
export const Untitled: Story = {
  args: { title: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link')).toHaveTextContent('Brenna Ashdown');
    await expect(canvas.getByRole('link')).not.toHaveTextContent('·');
    await expect(canvas.getByRole('button', { name: "Name Brenna Ashdown's campaign" })).toBeInTheDocument();
  },
};

/** The player names it in place, at any time. */
export const Renaming: Story = {
  args: { title: null },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: "Name Brenna Ashdown's campaign" }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: "Title for Brenna Ashdown's campaign" }),
      'Clusterfuck Express',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save the title' }));
    await expect(args.onRename).toHaveBeenCalledWith('Clusterfuck Express');
  },
};

/** The GM's seat: no one is played. */
export const GameMaster: Story = {
  args: { name: 'Game master', title: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link')).toHaveTextContent('Game master');
  },
};

/** Deleting needs the campaign's name typed exactly; Delete stays disabled until then. */
export const Deleting: Story = {
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete Clusterfuck Express' }));
    const confirm = await page.findByRole('button', { name: 'Delete' });
    await expect(confirm).toBeDisabled();
    await userEvent.type(page.getByRole('textbox', { name: 'Type Clusterfuck Express to confirm' }), 'Clusterfuck');
    await expect(confirm).toBeDisabled();
    await userEvent.type(page.getByRole('textbox', { name: 'Type Clusterfuck Express to confirm' }), ' Express');
    await expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await expect(args.onDelete).toHaveBeenCalledOnce();
  },
};

/** With no title, the character's name is what's typed. */
export const DeletingUntitled: Story = {
  args: { title: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete Brenna Ashdown' }));
    await expect(await page.findByRole('textbox', { name: 'Type Brenna Ashdown to confirm' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Keep it' }));
  },
};
