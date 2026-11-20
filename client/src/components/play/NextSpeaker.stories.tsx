// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { NextSpeaker } from './NextSpeaker';

function Harness(): React.ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <NextSpeaker
      cast={[
        { id: 'a', name: 'Ada Vance' },
        { id: 'b', name: 'Bram' },
      ]}
      picked={picked}
      upNext='b'
      onPick={setPicked}
    />
  );
}

const meta: Meta<typeof Harness> = { title: 'Play/Next speaker', component: Harness };
export default meta;
type Story = StoryObj<typeof Harness>;

export const Pick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'In turn (Bram)' })).toBeChecked();
    await userEvent.click(canvas.getByRole('radio', { name: 'Ada Vance' }));
    await expect(canvas.getByRole('radio', { name: 'Ada Vance' })).toBeChecked();
  },
};
