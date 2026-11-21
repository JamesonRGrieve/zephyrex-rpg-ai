// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { SamplerValue } from '~/features/prompt/samplers';
import { MoreSamplers } from './MoreSamplers';

function Harness({ initial }: { initial: Record<string, SamplerValue> }): React.ReactElement {
  const [value, setValue] = useState(initial);
  return <MoreSamplers value={value} onChange={setValue} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Manage/More samplers',
  component: Harness,
  args: { initial: {} },
  decorators: [(Story) => <div className='max-w-xl'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** Folded away and off until set; opening it shows each group, and setting one counts it. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('More samplers'));
    await expect(canvas.getByRole('group', { name: 'DRY and XTC' })).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText('Seed'), '42');
    await expect(canvas.getByText('More samplers (1 set)')).toBeInTheDocument();
  },
};

/** A preset read in from SillyTavern, with several set. */
export const SeveralSet: Story = {
  args: { initial: { min_p: 0.05, dry_multiplier: 0.8, banned_strings: ['As an AI'] } },
};
