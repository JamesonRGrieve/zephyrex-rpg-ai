// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { GroupSettings } from '~/features/chat/groupSettings';
import { GroupModes } from './GroupModes';

function Modes({ start }: { start: GroupSettings }) {
  const [value, setValue] = useState(start);
  return <GroupModes value={value} onChange={setValue} />;
}

const meta: Meta<typeof Modes> = {
  title: 'Play/Group modes',
  component: Modes,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: { start: {} },
};
export default meta;
type Story = StoryObj<typeof Modes>;

/** The defaults: the speaker's card, natural order. Joining cards asks what wraps each. */
export const Defaults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Every member’s card' }));
    await expect(canvas.getByLabelText('After each card')).toHaveValue('</{{char}}>');
  },
};

/** A table that takes turns in order and plays on by itself after half a minute. */
export const InOrderOnAuto: Story = {
  args: { start: { order: 'list', auto_seconds: 30, scenario: 'The ship is boarded.' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'In order' })).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByLabelText('Reply by themselves after (seconds)')).toHaveValue(30);
  },
};
