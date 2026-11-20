// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { FolderFilter } from '~/features/chat/library';
import { FolderChips } from './FolderChips';

function Harness(): React.ReactElement {
  const [value, setValue] = useState<FolderFilter>({ kind: 'all' });
  return <FolderChips folders={['Crew', 'Villains', 'One-shots']} value={value} onChange={setValue} />;
}

const meta: Meta<typeof Harness> = { title: 'Common/Folder chips', component: Harness };
export default meta;
type Story = StoryObj<typeof Harness>;

/** All, each folder, No folder: one chosen at a time. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Villains' }));
    await expect(canvas.getByRole('radio', { name: 'Villains' })).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
  },
};
