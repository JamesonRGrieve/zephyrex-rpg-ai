// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { Scenario } from '~/features/data/records';
import { SABOTAGE } from './fixtures';
import { ScenarioPlay } from './ScenarioPlay';

function Harness(): React.ReactElement {
  const [scenario, setScenario] = useState<Scenario>(SABOTAGE);
  return <ScenarioPlay scenario={scenario} onChange={(next) => setScenario({ ...scenario, ...next })} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Campaign/Scenario in play',
  component: Harness,
  decorators: [(Story) => <div className='max-w-md'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

export const FillTheClock: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Fill a segment of The pump fails' }));
    await expect(canvas.getByText('Full: the ship drifts')).toBeInTheDocument();
  },
};
