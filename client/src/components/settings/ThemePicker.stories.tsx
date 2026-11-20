// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ThemeChips } from './ThemePicker';

function Harness(): React.ReactElement {
  const [current, setCurrent] = useState('dark');
  return <ThemeChips themes={['light', 'dark', 'colorblind', 'colorblind-dark']} current={current} onChange={setCurrent} />;
}

const meta: Meta<typeof Harness> = { title: 'Settings/Appearance', component: Harness };
export default meta;
type Story = StoryObj<typeof Harness>;

/** The framework's four themes; one chosen at a time. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Light' }));
    await expect(canvas.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  },
};
