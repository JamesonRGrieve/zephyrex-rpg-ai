// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type Objective, ObjectivesEditor } from './ObjectivesEditor';

function Harness(): React.ReactElement {
  const [value, setValue] = useState<Objective[]>([
    { text: 'Board the Kestrel', done: true },
    { text: 'Fix the pump', done: false },
  ]);
  return <ObjectivesEditor value={value} onChange={setValue} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Play/Objectives',
  component: Harness,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

export const TickAndAdd: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Done: Fix the pump' }));
    await expect(canvas.queryByText('Current')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText('New objective'), 'Reach Vell{Enter}');
    await expect(canvas.getByText('Current').parentElement).toHaveTextContent('Reach Vell');
  },
};
