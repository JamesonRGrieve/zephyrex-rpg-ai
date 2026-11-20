// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ManagedList } from './ManagedList';

const ROWS = [
  { id: 'p1', name: 'Sam', note: 'A new deckhand' },
  { id: 'p2', name: 'Captain Reyes', note: 'Commands the Kestrel' },
];

const meta: Meta<typeof ManagedList<(typeof ROWS)[number]>> = {
  title: 'Manage/Managed list',
  component: ManagedList,
  args: {
    what: 'persona',
    rows: ROWS,
    summary: (row) => row.note,
    isDefault: (row) => row.id === 'p1',
    newLabel: 'New persona',
    emptyText: 'No personas yet.',
    editor: (row) => <p>Editing {row?.name ?? 'a new persona'}</p>,
    onDelete: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Default')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Captain Reyes/ }));
  },
};

export const Empty: Story = { args: { rows: [] } };
