// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { MemoryAcross } from './MemoryAcross';

function Harness(): React.ReactElement {
  const [on, setOn] = useState(false);
  return <MemoryAcross name='Ada Vance' value={on} onChange={setOn} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Characters/Memory across chats',
  component: Harness,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** Off until the person turns it on; the hint says whose chats it reads. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Remember across chats' });
    await expect(toggle).not.toBeChecked();
    await expect(canvas.getByText(/Only yours, never anyone else’s/)).toBeInTheDocument();
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
  },
};
