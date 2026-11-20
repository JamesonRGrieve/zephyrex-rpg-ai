// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { EntryFields } from '~/features/import/stLorebook';
import { EntryForm } from './EntryForm';
import { BLANK_ENTRY, SPANNER_ENTRY } from './fixtures';

function Controlled({ initial }: { initial: EntryFields }) {
  const [value, setValue] = useState(initial);
  return <EntryForm value={value} onChange={setValue} />;
}

const meta: Meta<typeof Controlled> = {
  title: 'Lore/Entry form',
  component: Controlled,
  args: { initial: SPANNER_ENTRY },
  decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Controlled>;

/** Choosing a depth position shows the depth and the role. */
export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText('Position'), 'at_depth');
    await expect(canvas.getByLabelText('Depth (messages from the end)')).toBeInTheDocument();
  },
};

export const Blank: Story = { args: { initial: BLANK_ENTRY } };
