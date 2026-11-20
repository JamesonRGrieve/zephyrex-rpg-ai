// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DEFAULT_DEVICE_SETTINGS } from '~/features/settings/deviceSettings';
import { DeviceSettingsForm } from './DeviceSettingsForm';

const meta: Meta<typeof DeviceSettingsForm> = {
  title: 'Settings/Device settings',
  component: DeviceSettingsForm,
  args: { settings: { ...DEFAULT_DEVICE_SETTINGS, tier: 'auto', showTableTalk: true }, measured: 'standard', onChange: fn() },
};
export default meta;
type Story = StoryObj<typeof DeviceSettingsForm>;

export const Measured: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('This device measured as Balanced.')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: /Light/ }));
    await expect(args.onChange).toHaveBeenCalledWith({ tier: 'light' });
  },
};

export const Measuring: Story = { args: { measured: null } };
